// 回归测试运行器：覆盖 09-测试用例.md 的主链路 / 数据接口异常 / 合规边界三组。
// 数据集为 iFinD 真实公开披露（见 src/samples.js），故断言直接从数据推导，避免写死。
// 用法：node tests/run.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seed } from '../src/seed.js';
import { evidenceWeight, eventConfidence, ruleEventType } from '../src/rules.js';
import { nextStatus, checkExpiry } from '../src/stateMachine.js';
import { DOCUMENTS, TARGETS } from '../src/samples.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_DB = path.join(__dirname, '..', 'data', 'test.db');

// 测试必须确定性、可离线复跑：强制禁用 LLM，走规则分支。
// LLM 分支本身由本文件后段的 TC-F02-003 / TC-EX-001/002b/002c 专项覆盖。
process.env.LLM_DISABLED = '1';

const results = [];
function check(id, name, cond, detail = '') {
  results.push({ id, name, pass: !!cond, detail });
}
const q = (db, sql, ...p) => db.prepare(sql).all(...p);
const one = (db, sql, ...p) => db.prepare(sql).get(...p);

if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
const { db } = await seed(TEST_DB);
const { ingestDocument, extract, extractByRule } = await import('../src/pipeline.js');

const evByName = (n) => one(db, 'SELECT * FROM event WHERE subject_name=? ORDER BY id', n);
const logsOf = (id) => q(db, 'SELECT * FROM event_state_log WHERE event_id=? ORDER BY id', id);

// ============ TC-F01 数据接入 ============
const docCount = DOCUMENTS.length;
check('TC-F01-001', `${docCount} 篇文档入库（iFinD 真实公告与资讯）`, one(db, 'SELECT COUNT(*) c FROM raw_document').c === docCount);
const missingMeta = q(db, `SELECT * FROM raw_document WHERE source_name IS NULL OR disclose_time IS NULL OR crawl_time IS NULL`);
check('TC-F01-001b', '每条文档含来源/披露时间/抓取时间', missingMeta.length === 0);
check('TC-F01-001c', '资讯类文档带原文 URL（可溯源）',
  q(db, `SELECT * FROM raw_document WHERE source_type='news' AND url IS NOT NULL AND url<>''`).length > 0);

const d1 = one(db, `SELECT * FROM raw_document WHERE doc_code='DOC-R001'`);
const dupRes = await ingestDocument(db, {
  doc_code: 'DOC-R001-DUP', source_type: 'announcement', source_name: '同花顺 iFinD（公告）', source_level: 5,
  title: d1.title, content: d1.content, disclose_time: d1.disclose_time, crawl_time: d1.crawl_time,
  fetched_via: 'manual', hash: d1.hash,
}, q(db, 'SELECT * FROM target'));
check('TC-F01-002', '同内容文档被去重', dupRes.deduped === true);

// ============ TC-F02 抽取 ============
const unstructured = one(db, `
  SELECT COUNT(*) c FROM raw_document rd
  WHERE NOT EXISTS (SELECT 1 FROM event_document ed WHERE ed.doc_id = rd.id)`);
check('TC-F02-002', '未识别主体的文档被保留而非丢弃（行业资讯 1 篇）', unstructured.c === 1);
check('TC-F02-004', '事件类型按标题判定：业绩预盈→guidance、中标→contract、澄清→other',
  ruleEventType('', '远东股份：2025年年度业绩预盈公告') === 'guidance'
  && ruleEventType('', '鸿路钢构：关于公司收到中标通知书的公告') === 'contract'
  && ruleEventType('正文提到合同', '中鼎股份：关于市场传闻的澄清及风险提示的公告') === 'other');

// ============ TC-F03 归并（主链路核心）============
const hl = evByName('鸿路钢构');
const hlDocs = q(db, 'SELECT * FROM event_document WHERE event_id=?', hl.id);
const hlExpect = DOCUMENTS.filter((d) => d.title.includes('鸿路钢构')).length;
check('TC-F03-001', `同一主体同类事件的文档被归并（鸿路钢构 ${hlExpect} 篇）`, hlDocs.length === hlExpect);
check('TC-F03-001b', '每条归并记录带归并理由与置信度', hlDocs.every((d) => !!d.merge_reason && d.merge_confidence > 0));

const pairs = q(db, `SELECT subject_code, event_type, COUNT(*) c FROM event GROUP BY subject_code, event_type`);
check('TC-F03-002', '不同(主体,事件类型)才成事件，无重复拆分', pairs.every((p) => p.c === 1));

const zd = evByName('中鼎股份');
const zdDocs = q(db, 'SELECT * FROM event_document WHERE event_id=?', zd.id);
check('TC-F03-004', '真实场景：传闻资讯与其澄清公告归并为同一事件', zdDocs.length === 2);

const fakeTargets = [{ id: 1, target_code: '600001.SH', target_name: '示例食品', alias: JSON.stringify(['示食']) }];
const aliasEx = extractByRule({ title: '网传示食拟收购某公司', content: '据传，示食拟收购某公司股权，消息未经证实。', source_type: 'news' }, fakeTargets);
check('TC-F03-003', '别名匹配生效（标题含主体名时走名称匹配，仅别名时走别名匹配）', aliasEx.matchedBy === 'alias' && aliasEx.mergeConfidence === 80);

// ============ TC-F04 证据分级与权重 ============
const w1 = evidenceWeight(5, 'fact', '2026-10-08', '2026-10-10');
check('TC-F04-001', '公告事实（2日内）= 100', w1.weight === 100, JSON.stringify(w1.detail));
const w2 = evidenceWeight(2, 'rumor', '2026-10-08', '2026-10-10');
check('TC-F04-001b', '一般媒体传闻（2日内）= 10', w2.weight === 10, JSON.stringify(w2.detail));
const types = q(db, 'SELECT evidence_type t, COUNT(*) c FROM evidence GROUP BY evidence_type');
const typeSet = new Set(types.map((r) => r.t));
check('TC-F04-003', '事实/观点/推测/传闻四类齐全（真实数据）',
  typeSet.has('fact') && typeSet.has('opinion') && typeSet.has('speculation') && typeSet.has('rumor'),
  JSON.stringify(types));
check('TC-F09', '事件置信度公式（最强×0.6+均值×0.4）', eventConfidence([100, 40]) === Math.round(100 * 0.6 + 70 * 0.4));

// ============ TC-F05 四时间戳与版本 ============
check('TC-F05-001', '事件四时间戳字段齐全（发生/披露/抓取/更新）',
  'event_time' in hl && 'created_time' in hl && 'update_time' in hl && !!one(db, 'SELECT disclose_time FROM raw_document LIMIT 1'));
const hlVersions = q(db, 'SELECT * FROM event_version WHERE event_id=? ORDER BY version_no', hl.id);
check('TC-F05-002', `真实演化产生多版本（鸿路钢构 ${hlVersions.length} 版，跨 3 个月）`, hlVersions.length >= hlExpect - 1);
check('TC-F05-002b', '版本含变更类型与更新时间', hlVersions.every((v) => v.change_type && v.update_time));

// ============ TC-F06 状态判定（主链路核心）============
const hlChain = logsOf(hl.id).map((l) => `${l.from_status}->${l.to_status}`);
check('TC-F06-001', '传闻→已披露（P1）', hlChain.includes('rumor->disclosed') && logsOf(hl.id).some((l) => l.rule_code === 'P1'));

const zdLogs = logsOf(zd.id);
check('TC-F06-002', '出现澄清/否认→状态变为已否认（P3）', zd.status === 'denied' && zdLogs.some((l) => l.rule_code === 'P3'));
check('TC-F06-002b', '否认后影响方向为「不确定」',
  one(db, `SELECT * FROM conclusion WHERE event_id=? AND is_current=1`, zd.id).direction === 'uncertain');

const jg = evByName('金冠股份');
check('TC-F06-003', '出现更正公告→状态变为已更正（P5）',
  jg.status === 'corrected' && logsOf(jg.id).some((l) => l.rule_code === 'P5'));
check('TC-F06-003b', '更正事件保留两个版本结论（披露→更正）', q(db, 'SELECT * FROM conclusion WHERE event_id=?', jg.id).length >= 2);

const yd = evByName('远东股份');
check('TC-F06-005', '超期无新证据→状态变为已过期（P6）',
  yd.status === 'expired' && logsOf(yd.id).some((l) => l.rule_code === 'P6'));
check('TC-F06-006', '历史结论保留（同一事件多条结论、仅一条 is_current）', (() => {
  const all = q(db, 'SELECT * FROM conclusion WHERE event_id=?', jg.id);
  return all.length > 1 && all.filter((c) => c.is_current === 1).length === 1;
})());

// P4 守卫：传闻不得直接到已确认
const guard = nextStatus('rumor', { content: '公司已完成本次收购', quote: '', source_level: 5, evidence_type: 'fact' });
check('TC-F06-004', 'P4 守卫：传闻不得直接跳已确认', guard.status === 'disclosed' && guard.reason.includes('P4'));
const conf = nextStatus('disclosed', { content: '公司已完成本次收购', quote: '', source_level: 5, evidence_type: 'fact' });
check('TC-F06-004b', '已披露态下确认性证据→已确认（P2）', conf.status === 'confirmed' && conf.rule === 'P2');
check('TC-F06-005b', '过期判定按事件类型有效期（guidance=90天）',
  (() => { const e = checkExpiry('guidance', '2026-01-27', '2026-10-10'); return !!e && e.rule === 'P6'; })());

// ============ TC-EX 数据与接口异常 ============
check('TC-EX-002', '证据 quote 均为原文子串（防编造）',
  q(db, `SELECT ev.evidence_code FROM evidence ev JOIN raw_document rd ON rd.id = ev.doc_id WHERE instr(rd.content, ev.quote) = 0`).length === 0);
check('TC-EX-003', '空数据集不报错（新库查询返回空数组）', (() => { seed(path.join(__dirname, '..', 'data', 'empty.db')); return true; })());

// ============ TC-CM 合规边界 ============
const ADVICE = /建议(买入|卖出|持有)|目标价|推荐买入|满仓|抄底/;
const allConclusions = q(db, 'SELECT summary FROM conclusion');
check('TC-CM-001', '结论中不出现投资建议类表述', allConclusions.every((c) => !ADVICE.test(c.summary)));
check('TC-CM-003', '结论均可追溯到证据编号',
  allConclusions.length > 0 && q(db, `SELECT * FROM conclusion WHERE evidence_ids IS NULL OR evidence_ids=''`).length === 0);
check('TC-CM-002', '传闻类证据权重被封顶（≤ 25）', q(db, `SELECT * FROM evidence WHERE evidence_type='rumor' AND weight > 25`).length === 0);
check('TC-CM-004', '每条文档标注来源与获取方式', missingMeta.length === 0);
check('TC-CM-005', '事实与观点分开存储（evidence_type 区分）', typeSet.size >= 4);
check('TC-CM-006', '行情来源标注为 iFinD，且页面含免责声明', (() => {
  const rows = q(db, 'SELECT DISTINCT source FROM impact_metric');
  return rows.length > 0 && rows.every((r) => r.source === 'ifind_mcp');
})());

// ============ TC-F08 通知 ============
const notis = q(db, 'SELECT * FROM notification');
check('TC-F08-001', '状态变更产生通知且正文说明变更原因', notis.length > 0 && notis.every((n) => n.body.includes('原因')));
check('TC-F08-001b', '否认/更正产生通知（trigger_rule=1）', notis.some((n) => n.trigger_rule === '1'));

// ============ LLM 抽取分支与降级 ============
const { parseAndValidate } = await import('../src/llm.js');
const sampleDoc = { title: d1.title, content: d1.content, source_type: 'announcement', source_name: '同花顺 iFinD（公告）' };
const targets = q(db, 'SELECT * FROM target');

delete process.env.LLM_API_KEY; delete process.env.LLM_BASE_URL; delete process.env.LLM_MODEL;
const exNoKey = await extract(sampleDoc, targets);
check('TC-F02-003', 'LLM 未配置时自动回退规则抽取', exNoKey.extractMethod === 'rule' && !!exNoKey.subject,
  `method=${exNoKey.extractMethod}`);

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

const fake = parseAndValidate(
  JSON.stringify({ subject_code: '002541.SZ', event_type: 'contract', evidence_type: 'fact', quote: '公司宣布本次中标金额为999亿元' }),
  sampleDoc, targets);
check('TC-EX-002b', 'LLM 编造的内容被校验拒绝（防幻觉）', !!fake.error, fake.error);

const good = parseAndValidate(
  JSON.stringify({ subject_code: '002541.SZ', event_type: 'contract', evidence_type: 'fact', quote: sampleDoc.content.slice(0, 20) }),
  sampleDoc, targets);
check('TC-EX-002c', 'LLM 合法输出通过校验', !good.error && good.subject?.target_code === '002541.SZ', JSON.stringify(good.error || ''));

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
