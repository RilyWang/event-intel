// Cloudflare Pages Functions 共享逻辑：在快照数据上实现与 Express 版一致的 API 契约。
// 数据来源：cf/snapshot.js（由 backend/src/snapshot.js 从已跑通的数据库导出，含 LLM 抽取结果）
// 枚举字典直接复用后端规则文件，避免两份定义漂移。
import snapshot from './snapshot.js';
import {
  AS_OF, EVENT_TYPE_CN, EVIDENCE_TYPE_CN, STATUS_CN, DIRECTION_CN,
} from '../backend/src/rules.js';

const T = snapshot.tables;
const DISCLAIMER = '本平台仅呈现投资事件与公开证据，用于情报整理与追溯，不构成任何投资建议。';
export const MODE = 'snapshot';

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });
export const ok = (data) => json({ code: 0, message: 'ok', data });
export const fail = (code, message) => json({ code, message, data: null });
const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');

// ---------- 端点实现 ----------

export function health() {
  const ex = snapshot.extraction || { label: '未知', llm_events: 0, rule_events: 0 };
  return ok({
    status: 'up',
    time: now(),
    as_of: AS_OF,
    mode: MODE,
    db: `snapshot（只读快照；数据来源：${ex.label}）`,
    extraction: ex,
    llm: {
      // 注意：描述的是「这批数据由什么抽取」，不是「线上能调 LLM」
      data_extracted_by: ex.label,
      note: '线上为只读快照，运行时不调用 LLM；实时抽取见本地完整版（README §8）',
    },
    data_sources: {
      ifind_mcp: 'not_configured', fuyao: 'not_configured',
      cninfo: 'available', public_web: 'available', sample: 'available',
    },
  });
}

export function meta() {
  return ok({
    as_of: AS_OF,
    event_type: EVENT_TYPE_CN,
    evidence_type: EVIDENCE_TYPE_CN,
    status: STATUS_CN,
    direction: DIRECTION_CN,
    disclaimer: DISCLAIMER,
  });
}

export function stats() {
  const byStatus = {};
  for (const e of T.event) byStatus[e.status] = (byStatus[e.status] || 0) + 1;
  return ok({
    targets: T.target.length,
    documents: T.raw_document.length,
    events: T.event.length,
    evidence: T.evidence.length,
    pending_notifications: T.notification.filter((n) => n.is_read === 0).length,
    by_status: Object.entries(byStatus)
      .map(([status, c]) => ({ status, c }))
      .sort((a, b) => a.status.localeCompare(b.status)),
  });
}

export function events(url) {
  const status = url.searchParams.get('status');
  const type = url.searchParams.get('type');
  const q = url.searchParams.get('q');
  let rows = T.event.slice();
  if (status) rows = rows.filter((e) => e.status === status);
  if (type) rows = rows.filter((e) => e.event_type === type);
  if (q) rows = rows.filter((e) => (e.title || '').includes(q) || (e.subject_name || '').includes(q));
  rows = rows
    .map((e) => ({
      ...e,
      evidence_count: T.evidence.filter((v) => v.event_id === e.id).length,
      doc_count: T.event_document.filter((d) => d.event_id === e.id).length,
    }))
    .sort((a, b) => String(b.update_time).localeCompare(String(a.update_time)));
  return ok(rows);
}

export function eventDetail(code) {
  const ev = T.event.find((e) => e.event_code === code);
  if (!ev) return fail(404, '事件不存在');

  const links = T.event_document.filter((d) => d.event_id === ev.id);
  const timeline = links
    .map((l) => {
      const rd = T.raw_document.find((r) => r.id === l.doc_id) || {};
      const evid = T.evidence.find((v) => v.doc_id === l.doc_id && v.event_id === ev.id) || {};
      return {
        id: rd.id, doc_code: rd.doc_code, source_type: rd.source_type, source_name: rd.source_name,
        source_level: rd.source_level, title: rd.title, content: rd.content, url: rd.url,
        disclose_time: rd.disclose_time, crawl_time: rd.crawl_time, fetched_via: rd.fetched_via,
        merge_reason: l.merge_reason, merge_confidence: l.merge_confidence,
        evidence_code: evid.evidence_code, evidence_type: evid.evidence_type,
        weight: evid.weight, quote: evid.quote, weight_detail: evid.weight_detail,
      };
    })
    .sort((a, b) => String(a.disclose_time).localeCompare(String(b.disclose_time)));

  const evidence = T.evidence
    .filter((v) => v.event_id === ev.id)
    .map((v) => {
      const rd = T.raw_document.find((r) => r.id === v.doc_id) || {};
      return { ...v, source_name: rd.source_name, disclose_time: rd.disclose_time, doc_url: rd.url };
    })
    .sort((a, b) => b.weight - a.weight);

  return ok({
    event: ev,
    first_source: T.raw_document.find((r) => r.id === ev.first_source_doc_id) || null,
    timeline,
    evidence,
    versions: T.event_version.filter((v) => v.event_id === ev.id).sort((a, b) => a.version_no - b.version_no),
    state_logs: T.event_state_log.filter((l) => l.event_id === ev.id).sort((a, b) => a.id - b.id),
    conclusions: T.conclusion.filter((c) => c.event_id === ev.id).sort((a, b) => b.version_no - a.version_no),
    impact: T.impact_metric.filter((m) => m.event_id === ev.id).sort((a, b) => String(a.metric_date).localeCompare(String(b.metric_date))),
    notifications: T.notification.filter((n) => n.event_id === ev.id).sort((a, b) => b.id - a.id),
  });
}

export function documents() {
  const rows = T.raw_document.map((rd) => {
    const link = T.event_document.find((d) => d.doc_id === rd.id);
    const ev = link ? T.event.find((e) => e.id === link.event_id) : null;
    return {
      ...rd,
      event_code: ev ? ev.event_code : null,
      subject_name: ev ? ev.subject_name : null,
      status: ev ? ev.status : null,
      unstructured: link ? 0 : 1,
    };
  }).sort((a, b) => String(b.disclose_time).localeCompare(String(a.disclose_time)));
  return ok(rows);
}

export function notifications() {
  const rows = T.notification.map((n) => {
    const ev = T.event.find((e) => e.id === n.event_id) || {};
    return { ...n, event_code: ev.event_code, event_title: ev.title, status: ev.status };
  }).sort((a, b) => {
    const t = String(b.created_time).localeCompare(String(a.created_time));
    return t !== 0 ? t : b.id - a.id;
  });
  return ok(rows);
}

// 快照为只读：写入类操作给出明确说明，不伪装成功
export function markRead(id) {
  return fail(503, `演示快照为只读，不支持标记已读（通知 #${id}）。完整功能请按 README 本地运行或部署完整 Node 版。`);
}

export function pipelineRun() {
  return fail(503, '演示快照为只读，不支持在线重跑主链路。当前数据即由 kimi-k2.6 真实抽取生成，可在本地用「重跑主链路」按钮或 node src/seed.js 复现。');
}
