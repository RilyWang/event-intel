// 补查：找一条清晰的真实"更正公告"
const fs = require('fs');
const { call } = require('C:\\Users\\DELL\\.zcode\\skills\\ifind-finance-data\\call-node.js');

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
  const tries = [
    '关于2026年半年度报告的更正公告',
    '关于2025年年度报告的更正公告',
    '关于中标金额的更正公告',
  ];
  const out = {};
  for (const q of tries) {
    try {
      const r = await call('news', 'search_notice', { query: q, time_start: '2026-01-01', time_end: '2026-10-10', size: 6 });
      const d = unwrap(r) || [];
      out[q] = d.map((x) => ({ 标题: x['公告标题'], 日期: x['日期'], 片段: String(x['公告片段内容'] || '').slice(0, 160) }));
      console.log(q, '=> 条目', Array.isArray(d) ? d.length : 0);
    } catch (e) { console.log(q, '=> 错误', e.message); }
    await new Promise((r) => setTimeout(r, 700));
  }
  fs.writeFileSync('D:\\Zcode\\tools\\ifind-correction.json', JSON.stringify(out, null, 2), 'utf8');
  console.log('已写入 ifind-correction.json');
})();
