// 用 iFinD 取真实日线行情，作为事件影响验证数据
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

const tasks = [
  ['002541', '鸿路钢构', '鸿路钢构2026年7月2日至2026年7月10日每日收盘价、涨跌幅、成交量'],
  ['002541b', '鸿路钢构', '鸿路钢构2026年10月7日至2026年10月9日每日收盘价、涨跌幅、成交量'],
  ['300510', '金冠股份', '金冠股份2026年7月21日至2026年7月24日每日收盘价、涨跌幅、成交量'],
  ['000887', '中鼎股份', '中鼎股份2026年8月12日至2026年8月14日每日收盘价、涨跌幅、成交量'],
  ['600869', '远东股份', '远东股份2026年1月26日至2026年1月28日每日收盘价、涨跌幅、成交量'],
  ['002761', '浙江建投', '浙江建投2026年10月8日至2026年10月9日每日收盘价、涨跌幅、成交量'],
];

(async () => {
  const out = {};
  for (const [k, name, q] of tasks) {
    try {
      const r = await call('stock', 'get_stock_performance', { query: q });
      out[k] = { name, query: q, status_code: r.status_code, parsed: unwrap(r) };
      console.log(k, name, '=> HTTP', r.status_code);
    } catch (e) {
      out[k] = { name, error: e.message };
      console.log(k, name, '=> 错误', e.message);
    }
    await sleep(700);
  }
  fs.writeFileSync('D:\\Zcode\\tools\\ifind-quotes.json', JSON.stringify(out, null, 2), 'utf8');
  console.log('已写入 ifind-quotes.json');
})();
