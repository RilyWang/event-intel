// 补抓：真实 传闻 / 观点 / 推测 类资讯，以覆盖证据四分类
const fs = require('fs');
const { call } = require('C:\\Users\\DELL\\.zcode\\skills\\ifind-finance-data\\call-node.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function unwrap(r) {
  const text = r?.data?.result?.content?.[0]?.text;
  const l1 = JSON.parse(text);
  let inner = l1.data;
  if (inner && typeof inner === 'object' && typeof inner.data === 'string') inner = inner.data;
  if (typeof inner === 'string') { try { return JSON.parse(inner); } catch { return inner; } }
  return inner;
}

const tasks = [
  ['zd_rumor', '中鼎股份 市场传闻', '2026-07-01', '2026-08-31'],
  ['zd_rumor2', '中鼎股份 战略合作 传闻', '2026-07-01', '2026-08-31'],
  ['hl_report', '鸿路钢构 研报 点评 订单', '2026-06-01', '2026-10-10'],
  ['hl_spec', '鸿路钢构 有望 或将 订单 增长', '2026-06-01', '2026-10-10'],
  ['jg_spec', '金冠股份 中标 影响 分析', '2026-07-01', '2026-08-31'],
];

(async () => {
  const out = {};
  for (const [k, q, s, e] of tasks) {
    try {
      const r = await call('news', 'search_news', { query: q, time_start: s, time_end: e, size: 5 });
      out[k] = { query: q, status_code: r.status_code, parsed: unwrap(r) };
      const d = out[k].parsed || [];
      console.log(k, '=> HTTP', r.status_code, '| 条目', Array.isArray(d) ? d.length : 0);
      if (Array.isArray(d)) for (const it of d) if (it['资讯标题']) console.log('     ', it['日期'], '|', it['资讯标题'].slice(0, 50));
    } catch (e) { console.log(k, '=> 错误', e.message); }
    await sleep(700);
  }
  fs.writeFileSync('D:\\Zcode\\tools\\ifind-types.json', JSON.stringify(out, null, 2), 'utf8');
  console.log('已写入 ifind-types.json');
})();
