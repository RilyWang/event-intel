// 补齐缺口：金冠股份原始中标公告、浙江建投公告+新闻；并输出真实数据到统一文件
const fs = require('fs');
const { call } = require('C:\\Users\\DELL\\.zcode\\skills\\ifind-finance-data\\call-node.js');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function unwrap(r) {
  const text = r?.data?.result?.content?.[0]?.text;
  if (!text) return null;
  const l1 = JSON.parse(text);
  let inner = l1.data;
  if (inner && typeof inner === 'object' && typeof inner.data === 'string') inner = inner.data;
  if (typeof inner === 'string') { try { return JSON.parse(inner); } catch { return inner; } }
  return inner;
}

(async () => {
  const out = {};
  const tasks = [
    ['jg_bid', 'news', 'search_notice', { query: '金冠股份 项目中标公告', time_start: '2026-06-01', time_end: '2026-08-31', size: 6 }],
    ['zj_js', 'news', 'search_notice', { query: '浙江建投 子公司收到中标通知书和签订工程合同', time_start: '2026-09-01', time_end: '2026-10-10', size: 5 }],
  ];
  for (const [k, st, tool, params] of tasks) {
    try {
      const r = await call(st, tool, params);
      const d = unwrap(r) || [];
      out[k] = d.map((x) => ({ 标题: x['公告标题'], 日期: x['日期'], 片段: x['公告片段内容'] }));
      console.log(k, '=> 条目', Array.isArray(d) ? d.length : 0);
    } catch (e) { console.log(k, '=> 错误', e.message); }
    await sleep(700);
  }
  fs.writeFileSync('D:\\Zcode\\tools\\ifind-gap.json', JSON.stringify(out, null, 2), 'utf8');
  console.log('已写入 ifind-gap.json');
})();
