// 主链路流水线：F-02 抽取 → F-03 归并 → F-04 证据分级 → F-05 版本 → F-06 状态与结论 → F-08 通知
import { nowStamp, nextSeqCode } from './db.js';
import * as R from './rules.js';
import { nextStatus, checkExpiry, notificationTriggers } from './stateMachine.js';
import { loadEnv } from './env.js';
import { extractWithLLM } from './llm.js';

loadEnv();

const MERGE_CONFIDENCE_MIN = 60;

const TYPE_RE = [
  [/收购|并购|重组|股权转让|资产购买|要约/, 'ma'],
  [/中标|合同|订单|签署|框架协议/, 'contract'],
  [/处罚|问询|违规|立案|监管|警示|谴责/, 'penalty'],
  [/业绩预告|业绩快报|净利润|预增|预减|营业收入/, 'guidance'],
  [/增持|减持|回购|股份转让/, 'equity'],
];

function pickQuote(content) {
  const parts = content.split(/(?<=[。；;!?])/).map((s) => s.trim()).filter(Boolean);
  const key = /收购|中标|否认|更正|金额|股权|处罚|业绩|不属实/;
  const hit = parts.find((p) => key.test(p));
  return (hit || parts[0] || content).slice(0, 140);
}

/** F-02 抽取 · 规则分支（无 LLM 时使用，也是 LLM 失败时的兜底） */
export function extractByRule(doc, targets) {
  const text = `${doc.title} ${doc.content}`;

  let subject = null;
  let matchedBy = null;
  let mergeConfidence = 0;
  for (const t of targets) {
    const aliases = t.alias ? JSON.parse(t.alias) : [];
    if (text.includes(t.target_name)) {
      subject = t; matchedBy = 'name'; mergeConfidence = 95; break;
    }
    const hitAlias = aliases.find((a) => text.includes(a));
    if (hitAlias) { subject = t; matchedBy = 'alias'; mergeConfidence = 80; break; }
  }

  let eventType = 'other';
  for (const [re, ty] of TYPE_RE) if (re.test(text)) { eventType = ty; break; }

  const amounts = [...text.matchAll(/([\d.]+)\s*(亿|万)?元/g)].map((m) => `${m[1]}${m[2] || ''}元`);
  const dm = text.match(/(20\d{2})年(\d{1,2})月(\d{1,2})日/);
  const eventTime = dm
    ? `${dm[1]}-${String(dm[2]).padStart(2, '0')}-${String(dm[3]).padStart(2, '0')}`
    : null;

  return {
    subject, matchedBy, mergeConfidence, eventType, amounts, eventTime,
    evidenceType: R.classifyEvidence(text, doc.source_type),
    quote: pickQuote(doc.content),
    extractMethod: 'rule',
  };
}

/**
 * F-02 抽取 · 统一入口：优先 LLM，失败/未配置/校验不通过 → 回退规则。
 * 契约一致，故回退对下游完全透明（TC-F02-003 / TC-EX-001 / TC-F04-002）。
 */
export async function extract(doc, targets) {
  const llm = await extractWithLLM(doc, targets);

  // LLM 未识别出主体时，仍用规则再试一次主体匹配（避免因模型漏判而丢事件）
  if (llm && !llm.fallback && llm.subject) {
    return {
      subject: llm.subject,
      matchedBy: 'llm',
      mergeConfidence: 90,
      eventType: llm.eventType,
      amounts: llm.amounts,
      eventTime: llm.eventTime,
      evidenceType: llm.evidenceType,
      quote: llm.quote,
      extractMethod: 'llm',
      llm_attempts: llm.attempts,
    };
  }

  const rule = extractByRule(doc, targets);
  return {
    ...rule,
    extractMethod: 'rule',
    llm_fallback_reason: llm?.fallback ? llm.error : (llm?.error || 'LLM 未识别出主体，改用规则匹配'),
  };
}

function upsertEvent(db, ex, doc, docId) {
  const existing = db.prepare(
    'SELECT * FROM event WHERE subject_code = ? AND event_type = ?'
  ).get(ex.subject.target_code, ex.eventType);
  if (existing) return existing;

  const code = nextSeqCode(db, 'event', 'event_code', 'EVT-2026-');
  const ts = nowStamp();
  const title = `${ex.subject.target_name} · ${R.EVENT_TYPE_CN[ex.eventType]}：${doc.title}`;
  const info = db.prepare(
    `INSERT INTO event (event_code, title, event_type, subject_name, subject_code, key_elements,
       event_time, status, event_confidence, first_source_doc_id, created_time, update_time)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    code, title, ex.eventType, ex.subject.target_name, ex.subject.target_code,
    JSON.stringify({ amounts: ex.amounts, extract_method: ex.extractMethod }),
    ex.eventTime, 'rumor', 0, docId, ts, ts
  );
  return db.prepare('SELECT * FROM event WHERE id = ?').get(info.lastInsertRowid);
}

/** 处理一篇文档：入库 → 抽取 → 归并 → 证据 → 状态 → 结论 → 通知 */
export async function ingestDocument(db, doc, targets) {
  const ts = nowStamp();

  // 去重（TC-F01-002）
  const dup = db.prepare('SELECT id FROM raw_document WHERE hash = ?').get(doc.hash);
  if (dup) return { deduped: true, doc_id: dup.id };

  const docInfo = db.prepare(
    `INSERT INTO raw_document (doc_code, source_type, source_name, source_level, title, content,
       url, disclose_time, crawl_time, fetched_via, hash)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    doc.doc_code, doc.source_type, doc.source_name, doc.source_level, doc.title, doc.content,
    doc.url || null, doc.disclose_time || null, doc.crawl_time, doc.fetched_via, doc.hash
  );
  const docId = Number(docInfo.lastInsertRowid);

  const ex = await extract(doc, targets);

  // 未识别主体的文档：不丢弃，作为「未结构化」保留（TC-F02-002）
  if (!ex.subject) return { doc_id: docId, unstructured: true };

  const ev = upsertEvent(db, ex, doc, docId);

  // F-03 归并关系（含归并理由）
  const linked = db.prepare('SELECT id FROM event_document WHERE event_id=? AND doc_id=?').get(ev.id, docId);
  if (!linked) {
    db.prepare(
      `INSERT INTO event_document (event_id, doc_id, merge_reason, merge_confidence, merged_by, linked_time)
       VALUES (?,?,?,?,?,?)`
    ).run(
      ev.id, docId,
      `主体一致（${ex.matchedBy === 'alias' ? '简称/别名匹配' : '名称匹配'}）+ 事件类型一致（${R.EVENT_TYPE_CN[ex.eventType]}）`,
      ex.mergeConfidence, 'rule', ts
    );
  }

  // F-04 证据分级与权重
  const wh = R.evidenceWeight(doc.source_level, ex.evidenceType, doc.disclose_time);
  const evCode = nextSeqCode(db, 'evidence', 'evidence_code', 'EVD-');
  const evInfo = db.prepare(
    `INSERT INTO evidence (evidence_code, event_id, doc_id, content, quote, evidence_type,
       source_level, weight, weight_detail, evidence_time, created_time)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`
  ).run(
    evCode, ev.id, docId,
    `${doc.title}（${R.EVIDENCE_TYPE_CN[ex.evidenceType]}，来源：${doc.source_name}）`,
    ex.quote, ex.evidenceType, doc.source_level, wh.weight, JSON.stringify(wh.detail),
    doc.disclose_time || null, ts
  );
  const evidenceId = Number(evInfo.lastInsertRowid);

  // F-06 状态判定
  const prevStatus = ev.status;
  const decision = nextStatus(prevStatus, {
    content: doc.title + doc.content, quote: ex.quote,
    source_level: doc.source_level, evidence_type: ex.evidenceType,
  });

  const lastEvTime = db.prepare(
    'SELECT MAX(disclose_time) AS t FROM raw_document rd JOIN event_document ed ON ed.doc_id = rd.id WHERE ed.event_id = ?'
  ).get(ev.id).t;
  const expiry = checkExpiry(ev.event_type, lastEvTime, R.AS_OF);
  const finalStatus = expiry ? expiry.status : decision.status;
  const finalRule = expiry ? expiry.rule : decision.rule;
  const finalReason = expiry ? expiry.reason : decision.reason;

  // 重新计算事件置信度（F-04 P9）
  const weights = db.prepare('SELECT weight FROM evidence WHERE event_id = ?').all(ev.id).map((r) => r.weight);
  const prevConf = ev.event_confidence;
  const conf = R.eventConfidence(weights);

  db.prepare('UPDATE event SET status=?, event_confidence=?, update_time=? WHERE id=?')
    .run(finalStatus, conf, ts, ev.id);

  const statusChanged = finalStatus !== prevStatus;
  let versionNo = db.prepare('SELECT COALESCE(MAX(version_no),0) AS v FROM event_version WHERE event_id=?').get(ev.id).v;

  if (statusChanged) {
    versionNo += 1;
    const direction = R.impactDirection(doc.title + doc.content, finalStatus);
    db.prepare(
      `INSERT INTO event_state_log (event_id, from_status, to_status, rule_code, reason, evidence_ids, changed_time)
       VALUES (?,?,?,?,?,?,?)`
    ).run(ev.id, prevStatus, finalStatus, finalRule || '-', finalReason || '', JSON.stringify([evCode]), ts);

    db.prepare(
      `INSERT INTO event_version (event_id, version_no, change_type, change_summary, trigger_doc_id, snapshot, update_time)
       VALUES (?,?,?,?,?,?,?)`
    ).run(
      ev.id, versionNo, changeTypeOf(finalStatus),
      `状态由「${R.STATUS_CN[prevStatus]}」变为「${R.STATUS_CN[finalStatus]}」：${finalReason || ''}`,
      docId,
      JSON.stringify({ status: finalStatus, confidence: conf, direction, evidence: [evCode] }),
      ts
    );

    // F-08 通知（P12）
    emitNotifications(db, ev, prevStatus, finalStatus, prevConf, conf, finalRule, finalReason, ts, versionNo, direction);
  } else if (versionNo === 0) {
    versionNo = 1;
    db.prepare(
      `INSERT INTO event_version (event_id, version_no, change_type, change_summary, trigger_doc_id, snapshot, update_time)
       VALUES (?,?,?,?,?,?,?)`
    ).run(ev.id, 1, 'initial', `事件首次识别：${doc.title}`, docId,
      JSON.stringify({ status: finalStatus, confidence: conf }), ts);
  }

  // F-06 结论重算（历史保留，is_current 切换）
  recomputeConclusion(db, ev, ts, versionNo, finalStatus);

  return {
    doc_id: docId, event_id: ev.id, event_code: ev.event_code, evidence_code: evCode,
    status: finalStatus, prev_status: prevStatus, confidence: conf, weight: wh.weight,
  };
}

function changeTypeOf(status) {
  return { denied: 'deny', corrected: 'correct', expired: 'expire', disclosed: 'update', confirmed: 'update', rumor: 'update' }[status] || 'update';
}

function emitNotifications(db, ev, prevStatus, nextStatus, prevConf, conf, rule, reason, ts, versionNo, direction) {
  const triggers = [];
  if (nextStatus === 'denied' || nextStatus === 'corrected') triggers.push(['1', '状态变更']);
  if (Math.abs(conf - prevConf) >= 20) triggers.push(['3', '置信度显著变化']);

  for (const [code, label] of triggers) {
    const title = `[${R.STATUS_CN[nextStatus]}] ${ev.title.slice(0, 40)}`;
    const body = `事件状态由「${R.STATUS_CN[prevStatus]}」变为「${R.STATUS_CN[nextStatus]}」。原因：${reason || '新证据入库'}。`
      + `置信度 ${prevConf} → ${conf}。影响方向：${R.DIRECTION_CN[direction] || '未定'}。`;
    db.prepare(
      `INSERT INTO notification (event_id, trigger_rule, title, body, change_detail, is_read, created_time)
       VALUES (?,?,?,?,?,0,?)`
    ).run(
      ev.id, code, title, body,
      JSON.stringify({ from: prevStatus, to: nextStatus, prev_confidence: prevConf, confidence: conf, direction, version_no: versionNo }),
      ts
    );
  }
}

/** F-06 结论：按事件当前版本重算，旧结论保留 */
export function recomputeConclusion(db, ev, ts, versionNo, status) {
  const st = status || ev.status;
  const rows = db.prepare(
    `SELECT e.*, rd.disclose_time FROM evidence e JOIN raw_document rd ON rd.id = e.doc_id
     WHERE e.event_id = ? ORDER BY e.id`
  ).all(ev.id);
  if (!rows.length) return;
  const text = rows.map((r) => r.content).join(' ');
  const direction = R.impactDirection(text, st);
  const confidence = R.eventConfidence(rows.map((r) => r.weight));
  const summary = `当前状态「${R.STATUS_CN[st]}」，影响方向「${R.DIRECTION_CN[direction]}」，`
    + `基于 ${rows.length} 条证据（最强权重 ${Math.max(...rows.map((r) => r.weight))}）。本平台仅呈现事件与证据，不构成投资建议。`;

  db.prepare('UPDATE conclusion SET is_current = 0 WHERE event_id = ? AND target_code = ? AND is_current = 1')
    .run(ev.id, ev.subject_code);
  db.prepare(
    `INSERT INTO conclusion (event_id, target_code, direction, confidence, summary, evidence_ids, is_current, version_no, created_time)
     VALUES (?,?,?,?,?,?,1,?,?)`
  ).run(
    ev.id, ev.subject_code, direction, confidence, summary,
    JSON.stringify(rows.map((r) => r.evidence_code)), versionNo || 1, ts
  );
}
