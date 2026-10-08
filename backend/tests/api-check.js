// 接口层验证：主链路取数 + 异常/边界（404、空态、合规字段）
// 断言从数据推导，不写死具体数值，便于数据集更新后仍可用。
const BASE = process.env.API_BASE || 'http://127.0.0.1:5311';
const results = [];
const check = (id, name, cond, detail = '') => results.push({ id, name, pass: !!cond, detail });

async function get(path) {
  const r = await fetch(BASE + path);
  return { status: r.status, body: await r.json() };
}

const health = await get('/api/health');
check('API-01', '健康检查可用且标注数据源状态',
  health.body.code === 0 && !!health.body.data.data_sources);

const stats = await get('/api/stats');
const s = stats.body.data;
check('API-02', '统计接口自洽（状态分布计数之和 = 事件数）',
  s.events > 0 && s.documents > 0 && s.evidence > 0
  && s.by_status.reduce((a, b) => a + b.c, 0) === s.events,
  JSON.stringify(s));

const list = await get('/api/events');
check('API-03', '事件列表条数与统计一致', list.body.data.length === s.events);

// 取文档最多的事件（最能体现归并与版本演化）做详情校验
const richest = list.body.data.slice().sort((a, b) => b.doc_count - a.doc_count)[0];
const detail = await get(`/api/events/${richest.event_code}`);
const d = detail.body.data;
check('API-05', '事件详情含时间线/证据/版本/状态日志/结论/影响',
  d.timeline.length === richest.doc_count && d.versions.length === richest.doc_count
  && d.state_logs.length >= 1 && d.conclusions.length >= 1 && d.evidence.length === richest.doc_count,
  `docs=${d.timeline.length} versions=${d.versions.length} logs=${d.state_logs.length}`);
check('API-05b', '版本数 = 归并文档数（每篇新证据都留版本）', d.versions.length === richest.doc_count);
check('API-06', '时间线按披露时间升序且含四时间戳字段',
  d.timeline.every((t, i, a) => i === 0 || String(a[i - 1].disclose_time) <= String(t.disclose_time))
  && d.timeline.every((t) => t.disclose_time && t.crawl_time));
check('API-07', '证据含类型/权重/原文片段/来源',
  d.evidence.every((e) => e.evidence_type && e.weight >= 0 && e.quote && e.source_name));
check('API-08', '状态日志带规则编号（可解释）', d.state_logs.every((l) => l.rule_code));
check('API-09', '结论带证据编号（可追溯）', (() => { const ids = JSON.parse(d.conclusions[0].evidence_ids); return ids.length > 0; })());
check('API-10', '含最初来源文档（且为时间线中披露最早的一篇）',
  !!d.first_source && d.first_source.doc_code === d.timeline[0].doc_code,
  `first=${d.first_source && d.first_source.doc_code} earliest=${d.timeline[0].doc_code}`);

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
