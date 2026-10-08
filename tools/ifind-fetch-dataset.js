// 从 iFinD 拉取真实公告与新闻，构建演示数据集
const fs = require('fs');
const { call } = require('C:\\Users\\DELL\\.zcode\\skills\\ifind-finance-data\\call-node.js');

const OUT = 'D:\\Zcode\\tools\\ifind-dataset.json';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** iFinD 返回是嵌套 JSON 字符串，逐层解析出 data 数组 */
function unwrap(r) {
  const text = r?.data?.result?.content?.[0]?.text;
  if (!text) return null;
  const l1 = JSON.parse(text);            // {code,msg,data:"..."}  或 {code,msg,data:{data:"..."}}
  let inner = l1.data;
  if (inner && typeof inner === 'object' && typeof inner.data === 'string') inner = inner.data;
  if (typeof inner === 'string') {
    try { return JSON.parse(inner); } catch { return inner; }
  }
  return inner;
}

const queries = [
  { key: '中标', st: 'news', tool: 'search_notice', params: { query: '鸿路钢构 收到中标通知书 公告', time_start: '2026-01-01', time_end: '2026-12-31', size: 5 } },
  { key: '澄清', st: 'news', tool: 'search_notice', params: { query: '关于市场传闻的澄清公告', time_start: '2026-06-01', time_end: '2026-10-10', size: 5 } },
  { key: '更正', st: 'news', tool: 'search_notice', params: { query: '中标金额 更正公告', time_start: '2026-06-01', time_end: '2026-10-10', size: 5 } },
  { key: '旧业绩预告', st: 'news', tool: 'search_notice', params: { query: '年度业绩预告', time_start: '2026-01-01', time_end: '2026-03-31', size: 5 } },
  { key: '新闻', st: 'news', tool: 'search_news', params: { query: '上市公司 重大合同 中标 订单', time_start: '2026-09-15', time_end: '2026-10-10', size: 5 } },
  { key: '研报观点', st: 'news', tool: 'search_news', params: { query: '券商研报 点评 中标 业绩预告', time_start: '2026-08-01', time_end: '2026-10-10', size: 5 } },
];

(async () => {
  const out = {};
  for (const q of queries) {
    try {
      const r = await call(q.st, q.tool, q.params);
      const d = unwrap(r);
      out[q.key] = { status_code: r.status_code, parsed: d };
      const n = Array.isArray(d) ? d.length : (d ? 1 : 0);
      console.log(q.key, '=> HTTP', r.status_code, '| 条目', n);
    } catch (e) {
      out[q.key] = { error: e.message };
      console.log(q.key, '=> 错误:', e.message);
    }
    await sleep(700); // 免费版每秒最多 2 并发，保守串行
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf8');
  console.log('已写入', OUT);
})();
