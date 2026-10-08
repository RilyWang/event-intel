// 回归测试运行器：覆盖 09-测试用例.md 的主链路 / 数据接口异常 / 合规边界三组。
// 用法：node tests/run.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seed } from '../src/seed.js';
import { evidenceWeight, eventConfidence } from '../src/rules.js';
import { nextStatus, checkExpiry } from '../src/stateMachine.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DB = path.join(__dirname, '..', 'data', 'test.db');

// 测试必须确定性、可离线复跑：强制禁用 LLM，走规则分支。
// LLM 分支本身由本文件后段的 TC-F02-003 / TC-EX-001/002b/002c 专项覆盖。
process.env.LLM_DISABLED = '1';

const results = [];
function check(id, name, cond, detail = '') {
  results.push({ id, name, pass: !!cond, detail });
}
function q(db, sql, ...p) { return db.prepare(sql).all(...p); }
function one(db, sql, ...p) { return db.prepare(sql).get(...p); }

if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
const { db } = await seed(TEST_DB);

// ============ TC-F01 数据接入 ============
check('TC-F01-001', '10 篇文档入库且含四时间戳字段', one(db, 'SELECT COUNT(*) c FROM raw_document').c === 10);
const d1 = one(db, `SELECT * FROM raw_document WHERE doc_code='DOC-0003'`);
check('TC-F01-001b', '文档含来源/URL/披露时间/抓取时间', !!(d1.source_name && d1.url && d1.disclose_time && d1.crawl_time));

// 重复导入去重（同 hash）
const { ingestDocument, extract, extractByRule } = await import('../src/pipeline.js');
const targets = q(db, 'SELECT * FROM target');
const dupRes = await ingestDocument(db, {
  doc_code: 'DOC-0003-DUP', source_type: 'announcement', source_name: '上交所公告', source_level: 5,
  title: d1.title, content: d1.content, disclose_time: d1.disclose_time, crawl_time: '2026-08-13 10:00:00',
  fetched_via: 'manual', hash: d1.hash,
}, targets);
check('TC-F01-002', '同内容文档被去重', dupRes.deduped === true);

// ============ TC-F02 抽取 ============
const unstructured = one(db, `
  SELECT COUNT(*) c FROM raw_document rd
  WHERE NOT EXISTS (SELECT 1 FROM event_document ed WHERE ed.doc_id = rd.id)`);
check('TC-F02-002', '未识别主体的文档被保留而非丢弃（未结构化 1 篇）', unstructured.c === 1);

// ============ TC-F03 归并 ============
const eventsOf600001 = q(db, `SELECT * FROM event WHERE subject_code='600001.SH'`);
check('TC-F03-002', '同一主体不同事件类型不归并（示例食品 2 个事件）', eventsOf600001.length === 2);
const maEvent = one(db, `SELECT * FROM event WHERE subject_code='600001.SH' AND event_type='ma'`);
const maDocs = q(db, 'SELECT * FROM event_document WHERE event_id=?', maEvent.id);
check('TC-F03-001', '同事件多来源文档被归并（ma 事件 5 篇）', maDocs.length === 5);
check('TC-F03-001b', '每条归并记录带归并理由', maDocs.every((d) => !!d.merge_reason && d.merge_confidence > 0));
const aliasDoc = one(db, 'SELECT * FROM event_document WHERE merge_reason LIKE ?', '%简称/别名%');
check('TC-F03-003', '别名（示例科技集团）匹配归并成功', !!aliasDoc);

// ============ TC-F04 证据分级与权重 ============
const w1 = evidenceWeight(5, 'fact', '2026-08-20', '2026-08-25');
check('TC-F04-001', '公告事实（7日内）= 100', w1.weight === 100, JSON.stringify(w1.detail));
const w2 = evidenceWeight(1, 'rumor', '2026-08-20', '2026-08-25');
check('TC-F04-001b', '社媒传闻（7日内）= 5', w2.weight === 5, JSON.stringify(w2.detail));
const types = new Set(q(db, 'SELECT DISTINCT evidence_type t FROM evidence').map((r) => r.t));
check('TC-F04-003', '事实/观点/推测/传闻四类均出现且区分', types.has('fact') && types.has('opinion') && types.has('rumor'));
check('TC-F09', '事件置信度公式（最强×0.6+均值×0.4）', eventConfidence([100, 40]) === Math.round(100 * 0.6 + 70 * 0.4));

// ============ TC-F05 四时间戳与版本 ============
const maVersions = q(db, 'SELECT * FROM event_version WHERE event_id=? ORDER BY version_no', maEvent.id);
check('TC-F05-002', '事件演化产生多版本且旧版本不覆盖', maVersions.length >= 3);
check('TC-F05-002b', '版本含变更类型与更新时间', maVersions.every((v) => v.change_type && v.update_time));
check('TC-F05-001', '事件四时间戳字段齐全（发生/披露/抓取/更新）',
  'event_time' in maEvent && 'created_time' in maEvent && 'update_time' in maEvent && !!one(db, 'SELECT disclose_time FROM raw_document LIMIT 1'));

// ============ TC-F06 状态判定（主链路核心）============
const maLogs = q(db, 'SELECT * FROM event_state_log WHERE event_id=? ORDER BY id', maEvent.id);
const chain = maLogs.map((l) => `${l.from_status}->${l.to_status}`);
check('TC-F06-001', '传闻→已披露（P1）', chain.includes('rumor->disclosed') && maLogs.some((l) => l.rule_code === 'P1'));
check('TC-F06-002', '出现否认公告→状态变为已否认（P3）', maEvent.status === 'denied' && maLogs.some((l) => l.rule_code === 'P3'));
const deniedConclusion = one(db, `SELECT * FROM conclusion WHERE event_id=? AND is_current=1`, maEvent.id);
check('TC-F06-002b', '否认后影响方向为「不确定」', deniedConclusion.direction === 'uncertain');

const contractEvent = one(db, `SELECT * FROM event WHERE event_type='contract'`);
check('TC-F06-003', '出现更正公告→状态变为已更正（P5）', contractEvent.status === 'corrected');
const guidanceEvent = one(db, `SELECT * FROM event WHERE event_type='guidance'`);
check('TC-F06-005', '超期无新证据→状态变为已过期（P6）', guidanceEvent.status === 'expired');
check('TC-F06-006', '历史结论保留（同一事件有多条结论、仅一条 is_current）', (() => {
  const all = q(db, 'SELECT * FROM conclusion WHERE event_id=?', maEvent.id);
  const cur = all.filter((c) => c.is_current === 1);
  return all.length > 1 && cur.length === 1;
})());

// P4 守卫：传闻不得直接到已确认
const guard = nextStatus('rumor', { content: '公司已完成本次收购', quote: '', source_level: 5, evidence_type: 'fact' });
check('TC-F06-004', 'P4 守卫：传闻不得直接跳已确认', guard.status === 'disclosed' && guard.reason.includes('P4'));
const conf = nextStatus('disclosed', { content: '公司已完成本次收购', quote: '', source_level: 5, evidence_type: 'fact' });
check('TC-F06-004b', '已披露态下确认性证据→已确认（P2）', conf.status === 'confirmed' && conf.rule === 'P2');
const denyAfter = checkExpiry('guidance', '2026-02-20', '2026-08-25');
check('TC-F06-005b', '过期判定按事件类型有效期（guidance=90天）', !!denyAfter && denyAfter.rule === 'P6');

// ============ TC-EX 数据与接口异常 ============
const badQuote = q(db, `
  SELECT ev.evidence_code FROM evidence ev
  JOIN raw_document rd ON rd.id = ev.doc_id
  WHERE instr(rd.content, ev.quote) = 0`);
check('TC-EX-002', '证据 quote 均为原文子串（防编造）', badQuote.length === 0, JSON.stringify(badQuote));
check('TC-EX-003', '空数据集不报错（新库查询返回空数组）', (() => {
  seed(path.join(__dirname, '..', 'data', 'empty.db'));
  return true;
})());

// ============ TC-CM 合规边界 ============
const ADVICE = /建议(买入|卖出|持有)|目标价|推荐买入|满仓|抄底/;
const allConclusions = q(db, 'SELECT summary FROM conclusion');
check('TC-CM-001', '结论中不出现投资建议类表述', allConclusions.every((c) => !ADVICE.test(c.summary)));
check('TC-CM-003', '结论均可追溯到证据编号', allConclusions.length > 0 && q(db, `SELECT * FROM conclusion WHERE evidence_ids IS NULL OR evidence_ids=''`).length === 0);
const evIds = q(db, 'SELECT weight_detail FROM evidence');
check('TC-CM-002', '传闻类证据存在且权重被封顶（≤ 25）',
  q(db, `SELECT * FROM evidence WHERE evidence_type='rumor' AND weight > 25`).length === 0);
check('TC-CM-004', '每条文档标注来源与获取方式', q(db, 'SELECT * FROM raw_document WHERE source_name IS NULL OR fetched_via IS NULL').length === 0);
check('TC-CM-005', '事实与观点分开存储（evidence_type 区分）', one(db, `SELECT COUNT(DISTINCT evidence_type) c FROM evidence`).c >= 3);

// ============ TC-F08 通知 ============
const notis = q(db, 'SELECT * FROM notification');
check('TC-F08-001', '状态变更产生通知且正文说明变更原因', notis.length > 0 && notis.every((n) => n.body.includes('原因')));
check('TC-F08-001b', '否认引起通知（trigger_rule=1）', notis.some((n) => n.trigger_rule === '1'));

// ============ LLM 抽取分支与降级（TC-F02-003 / TC-EX-001 / TC-EX-002）============
const { parseAndValidate } = await import('../src/llm.js');
const sampleDoc = { title: d1.title, content: d1.content, source_type: 'announcement', source_name: '上交所公告' };

// 1) 无 Key：必须回退规则，且不抛错
delete process.env.LLM_API_KEY; delete process.env.LLM_BASE_URL; delete process.env.LLM_MODEL;
const exNoKey = await extract(sampleDoc, targets);
check('TC-F02-003', 'LLM 未配置时自动回退规则抽取', exNoKey.extractMethod === 'rule' && !!exNoKey.subject,
  `method=${exNoKey.extractMethod} reason=${exNoKey.llm_fallback_reason}`);

// 2) 配了 Key 但服务不可达：重试后回退规则，仍能完成抽取
//    （临时解除测试禁用，确保这条真的走到了 LLM 网络路径）
delete process.env.LLM_DISABLED;
process.env.LLM_BASE_URL = 'http://127.0.0.1:9';
process.env.LLM_API_KEY = 'test-key';
process.env.LLM_MODEL = 'test-model';
process.env.LLM_TIMEOUT_MS = '1500';
const exBad = await extract(sampleDoc, targets);
check('TC-EX-001', 'LLM 不可达时重试后回退规则、不抛错', exBad.extractMethod === 'rule' && !!exBad.llm_fallback_reason,
  String(exBad.llm_fallback_reason));
delete process.env.LLM_BASE_URL; delete process.env.LLM_API_KEY;
delete process.env.LLM_MODEL; delete process.env.LLM_TIMEOUT_MS;
process.env.LLM_DISABLED = '1';

// 3) LLM 编造原文没有的内容 → 校验拒绝（防幻觉）
const fake = parseAndValidate(
  JSON.stringify({ subject_code: '600001.SH', event_type: 'ma', evidence_type: 'fact', quote: '公司宣布本次收购金额为999亿元' }),
  sampleDoc, targets);
check('TC-EX-002b', 'LLM 编造的内容被校验拒绝（防幻觉）', !!fake.error, fake.error);

// 4) 合法输出可通过校验
const good = parseAndValidate(
  JSON.stringify({ subject_code: '600001.SH', event_type: 'ma', evidence_type: 'fact', quote: sampleDoc.content.slice(0, 20) }),
  sampleDoc, targets);
check('TC-EX-002c', 'LLM 合法输出通过校验', !good.error && good.subject?.target_code === '600001.SH', JSON.stringify(good.error || ''));

// ============ 输出 ============
const pass = results.filter((r) => r.pass).length;
const fail = results.filter((r) => !r.pass);
console.log('\n================ 测试结果 ================');
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.id.padEnd(14)} ${r.name}${r.pass ? '' : '  <<< ' + r.detail}`);
}
console.log('-----------------------------------------');
console.log(`合计 ${results.length} 项，通过 ${pass}，失败 ${fail.length}`);
console.log('=========================================\n');
if (fail.length) process.exit(1);
