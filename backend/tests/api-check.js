// 接口层验证：主链路取数 + 异常/边界（404、空态、合规字段）
const BASE = process.env.API_BASE || 'http://127.0.0.1:8899';
const results = [];
const check = (id, name, cond, detail = '') => results.push({ id, name, pass: !!cond, detail });

async function get(path) {
  const r = await fetch(BASE + path);
  return { status: r.status, body: await r.json() };
}

const health = await get('/api/health');
check('API-01', '健康检查可用且标注数据源状态',
  health.body.code === 0 && health.body.data.data_sources.ifind_mcp === 'not_configured');

const stats = await get('/api/stats');
check('API-02', '统计接口返回事件/证据计数',
  stats.body.data.events === 3 && stats.body.data.documents === 10, JSON.stringify(stats.body.data));

const list = await get('/api/events');
check('API-03', '事件列表返回 3 个事件', list.body.data.length === 3);

const filtered = await get('/api/events?status=denied');
check('API-04', '按状态筛选（denied → 1 条）', filtered.body.data.length === 1, JSON.stringify(filtered.body.data.map(e => e.event_code)));

const detail = await get('/api/events/EVT-2026-0002');
const d = detail.body.data;
check('API-05', '事件详情含时间线/证据/版本/状态日志/结论/影响',
  d.timeline.length >= 5 && d.versions.length >= 3 && d.state_logs.length >= 2 && d.conclusions.length >= 1);
check('API-06', '时间线按披露时间升序且含四时间戳字段',
  d.timeline.every((t, i, a) => i === 0 || a[i - 1].disclose_time <= t.disclose_time)
  && d.timeline.every((t) => t.disclose_time && t.crawl_time));
check('API-07', '证据含类型/权重/原文片段/来源', d.evidence.every((e) => e.evidence_type && e.weight >= 0 && e.quote && e.source_name));
check('API-08', '状态日志带规则编号（可解释）', d.state_logs.every((l) => l.rule_code));
check('API-09', '结论带证据编号（可追溯）', (() => { const ids = JSON.parse(d.conclusions[0].evidence_ids); return ids.length > 0; })());
check('API-10', '含最初来源文档', !!d.first_source && d.first_source.doc_code === 'DOC-0001');

const notFound = await get('/api/events/EVT-NOT-EXIST');
check('API-11', '不存在的事件返回 404 业务码而非 500', notFound.body.code === 404 && notFound.status === 200);

const docs = await get('/api/documents');
check('API-12', '文档列表标记未结构化文档', docs.body.data.some((x) => x.unstructured === 1));

const notis = await get('/api/notifications');
check('API-13', '通知列表含事件编码与触发规则编号',
  notis.body.data.length > 0 && notis.body.data.every((n) => n.event_code && n.trigger_rule));

const meta = await get('/api/meta');
check('API-14', '元数据含免责声明与枚举字典',
  !!meta.body.data.disclaimer && !!meta.body.data.status.denied);

const pass = results.filter((r) => r.pass).length;
console.log('\n============ 接口层验证 ============');
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.id.padEnd(8)} ${r.name}${r.pass ? '' : '  <<< ' + r.detail}`);
console.log(`-----------------------------------\n合计 ${results.length} 项，通过 ${pass}，失败 ${results.length - pass}\n`);
if (pass !== results.length) process.exit(1);
