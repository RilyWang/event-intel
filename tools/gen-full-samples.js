// 生成 backend/src/samples.js 的完整内容：全部为 iFinD MCP 真实数据
const fs = require('fs');

const ds = JSON.parse(fs.readFileSync('D:\\Zcode\\tools\\ifind-dataset.json', 'utf8'));
const gap = JSON.parse(fs.readFileSync('D:\\Zcode\\tools\\ifind-gap.json', 'utf8'));
const zjNews = JSON.parse(fs.readFileSync('D:\\Zcode\\tools\\ifind-zj-news.json', 'utf8'));
const types = JSON.parse(fs.readFileSync('D:\\Zcode\\tools\\ifind-types.json', 'utf8'));
const quotes = JSON.parse(fs.readFileSync('D:\\Zcode\\tools\\ifind-quotes.json', 'utf8'));

const OUT = 'D:\\Zcode\\event-intel\\backend\\src\\samples.js';

const TARGETS = [
  { code: '002541.SZ', name: '鸿路钢构', alias: [] },
  { code: '300510.SZ', name: '金冠股份', alias: [] },
  { code: '000887.SZ', name: '中鼎股份', alias: [] },
  { code: '600869.SH', name: '远东股份', alias: [] },
  { code: '002761.SZ', name: '浙江建投', alias: [] },
];

function sel(arr, { has, not, date }, label) {
  for (const it of (arr || [])) {
    const t = it['标题'] || it['公告标题'] || it['资讯标题'] || '';
    const d = it['日期'] || '';
    const body = it['片段'] || it['公告片段内容'] || it['资讯内容'] || '';
    if (!body) continue;
    if (has && !t.includes(has)) continue;
    if (not && t.includes(not)) continue;
    if (date && d !== date) continue;
    return { title: t, date: d, body, url: it['URL'] || '' };
  }
  console.log('  [未命中] ' + label);
  return null;
}

const M = ds['中标']?.parsed || [];
const C = ds['澄清']?.parsed || [];
const Y = ds['旧业绩预告']?.parsed || [];
const JG = gap.jg_bid || [];
const ZJ = gap.zj_js || [];

const docs = [
  ['002541.SZ', sel(M, { has: '关于公司收到中标通知书的公告', date: '2026-07-04' }, 'hl0704')],
  ['002541.SZ', sel(M, { has: '关于公司签订重大经营合同的公告', date: '2026-07-10' }, 'hl0710')],
  ['002541.SZ', sel(M, { has: '关于公司全资子公司收到中标通知书的公告', date: '2026-10-08' }, 'hl1008')],
  ['002541.SZ', sel(M, { has: '关于公司及全资子公司收到中标通知书的公告', date: '2026-10-09' }, 'hl1009')],
  ['300510.SZ', sel(JG, { has: '关于项目中标的公告', not: '更正', date: '2026-07-22' }, 'jg0722')],
  ['300510.SZ', sel(JG, { has: '更正公告', date: '2026-07-23' }, 'jg0723')],
  ['000887.SZ', sel(C, { has: '澄清及风险提示', date: '2026-08-13' }, 'zd0813')],
  ['600869.SH', sel(Y, { has: '业绩预盈公告', date: '2026-01-27' }, 'yd0127')],
  ['002761.SZ', sel(ZJ, { has: '关于子公司收到中标通知书和签订工程合同', date: '2026-10-09' }, 'zj1009')],
  ['002761.SZ', sel(zjNews, { has: '中标', date: '2026-10-08' }, 'zjnews')],
  // 真实但不涉及任何关注标的的行业资讯：用于验证「未识别主体的文档被保留而非丢弃」
  [null, sel(ds['新闻']?.parsed || [], { has: '多家A股上市公司披露大额订单', date: '2026-09-18' }, 'industry')],
  // 以下三篇用于覆盖「事实/观点/推测/传闻」四分类（均为真实资讯）
  ['000887.SZ', sel(types.zd_rumor2?.parsed || [], { has: '回应传闻', date: '2026-08-12' }, 'zd_rumor')],   // 传闻
  ['002541.SZ', sel(types.hl_report?.parsed || [], { has: '半年报点评', date: '2026-09-10' }, 'hl_opinion')], // 观点（研报点评）
  ['002541.SZ', sel(types.hl_spec?.parsed || [], { has: '有望超预期', date: '2026-09-03' }, 'hl_spec')],   // 推测（含"有望"）
];

// ---- 解析行情 markdown 表 ----
function parseTable(ans) {
  if (typeof ans !== 'string') return [];
  const lines = ans.split('\n').filter((l) => l.trim().startsWith('|'));
  if (lines.length < 3) return [];
  const head = lines[0].split('|').map((s) => s.trim());
  const idx = (n) => head.findIndex((h) => h.includes(n));
  const iDate = idx('日期'), iClose = idx('收盘价'), iPct = idx('涨跌幅'), iVol = idx('成交量');
  const rows = [];
  for (const line of lines.slice(2)) {
    const c = line.split('|').map((s) => s.trim());
    const date = c[iDate];
    if (!/^\d{8}$/.test(date || '')) continue;
    const num = (s) => (s === '' || s == null ? null : Number(String(s).replace(/[^\d.\-]/g, '')));
    let vol = null;
    const vraw = c[iVol] || '';
    const vn = num(vraw);
    if (vn != null && vraw.includes('万')) vol = vn * 1e4;
    else if (vn != null && vraw.includes('亿')) vol = vn * 1e8;
    else vol = vn;
    rows.push({
      metric_date: date.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3'),
      close_price: num(c[iClose]),
      pct_change: num(c[iPct]),
      volume: vol,
    });
  }
  return rows;
}

const firstDay = {};
for (const [code, d] of docs) {
  if (!d) continue;
  if (!firstDay[code] || d.date < firstDay[code]) firstDay[code] = d.date;
}

const impact = [];
for (const k of Object.keys(quotes)) {
  const v = quotes[k];
  if (!v || v.error) continue;
  const ans = v.parsed && v.parsed.answer;
  const code = k.startsWith('002541') ? '002541.SZ'
    : k === '300510' ? '300510.SZ'
      : k === '000887' ? '000887.SZ'
        : k === '600869' ? '600869.SH' : '002761.SZ';
  for (const r of parseTable(ans)) {
    impact.push({
      target_code: code,
      anchor: r.metric_date < firstDay[code] ? 'pre_event' : 'post_event',
      ...r,
    });
  }
}

// ---- 写出 samples.js ----
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r?\n/g, ' ').replace(/\t/g, ' ');
const L = [];
L.push('// 样例数据：全部来自真实公开披露与行情，数据源为同花顺 iFinD MCP。');
L.push('// 内容逐字取自公告原文/资讯原文，未经改写；行情为 iFinD 真实日线数据。');
L.push('// 覆盖四类真实演化：更新（鸿路钢构 4 篇跨 3 个月）／更正（金冠股份）／否认（中鼎股份）／过期（远东股份）。');
L.push('// 获取方式：tools/ifind-fetch-*.js 通过 iFinD MCP 拉取后由 tools/gen-samples.js 生成。');
L.push('');
L.push('export const TARGETS = [');
for (const t of TARGETS) {
  L.push(`  { target_code: '${t.code}', target_name: '${t.name}', market: 'A', alias: JSON.stringify(${JSON.stringify(t.alias)}), active: 1 },`);
}
L.push('];');
L.push('');
L.push('// 按披露日期排列；同一主体+同一事件类型的多篇公告会被归并为同一事件');
L.push('export const DOCUMENTS = [');
let n = 0;
for (const [code, d] of docs) {
  if (!d) continue;
  n += 1;
  const isNews = d.url && !/公告/.test(d.title);
  const level = isNews ? 2 : 5;
  const source = isNews ? 'iFinD 财经资讯' : '同花顺 iFinD（公告）';
  const type = isNews ? 'news' : 'announcement';
  L.push('  {');
  L.push(`    doc_code: 'DOC-R${String(n).padStart(3, '0')}', source_type: '${type}', source_name: '${source}', source_level: ${level},`);
  L.push(`    title: '${esc(d.title)}',`);
  L.push(`    content: '${esc(d.body)}',`);
  L.push(`    disclose_time: '${d.date}', crawl_time: '${d.date}', fetched_via: 'ifind_mcp',`);
  L.push(`    url: '${esc(d.url)}',`);
  L.push(`    // 归属：${code || '不涉及关注标的（应作为未结构化文档保留）'}`);
  L.push('  },');
}
L.push('];');
L.push('');
L.push('// 事件影响验证：iFinD 真实日线行情（锚定事件披露日前后，仅作客观参考，不构成因果结论）');
L.push('export const IMPACT = [');
for (const r of impact) {
  L.push(`  { target_code: '${r.target_code}', anchor: '${r.anchor}', metric_date: '${r.metric_date}', close_price: ${r.close_price}, pct_change: ${r.pct_change}, volume: ${r.volume}, source: 'ifind_mcp' },`);
}
L.push('];');
L.push('');

fs.writeFileSync(OUT, L.join('\n'), 'utf8');
console.log('已生成', OUT);
console.log('  TARGETS:', TARGETS.length, '| DOCUMENTS:', n, '| IMPACT:', impact.length);
