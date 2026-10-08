// 一致性验证：Cloudflare Pages Functions（快照版）与 Express 版（完整版）接口输出必须一致。
// 用法：先启动两者，然后 node tests/cf-parity.js
//   Express:  cd backend && npm start        → http://127.0.0.1:5311
//   Pages:    wrangler pages dev frontend/dist --port 8788
const EXPRESS = process.env.EXPRESS_BASE || 'http://127.0.0.1:5311';
const PAGES = process.env.PAGES_BASE || 'http://127.0.0.1:8788';

const PATHS = [
  '/api/meta',
  '/api/stats',
  '/api/events',
  '/api/events?status=denied',
  '/api/events?q=收购',
  '/api/events/EVT-2026-0001',
  '/api/events/EVT-2026-0002',
  '/api/events/EVT-2026-0003',
  '/api/documents',
  '/api/notifications',
];

async function get(base, p) {
  const r = await fetch(base + p);
  const j = await r.json();
  return j;
}

/** 找出两个对象的第一个差异（用于定位问题，而非只报 true/false） */
function firstDiff(a, b, path = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (typeof a !== typeof b) return `${path}: 类型不同 ${typeof a} vs ${typeof b}`;
  if (a === null || b === null || typeof a !== 'object') return `${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`;
  if (Array.isArray(a) !== Array.isArray(b)) return `${path}: 数组/对象不同`;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return `${path}: 长度 ${a.length} vs ${b.length}`;
    for (let i = 0; i < a.length; i++) {
      const d = firstDiff(a[i], b[i], `${path}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    const d = firstDiff(a[k], b[k], `${path}.${k}`);
    if (d) return d;
  }
  return null;
}

const results = [];
for (const p of PATHS) {
  try {
    const [x, y] = await Promise.all([get(EXPRESS, p), get(PAGES, p)]);
    // 只比较 data 载荷；两者 code/message 契约相同
    const diff = firstDiff(x.data, y.data);
    results.push({ p, pass: !diff && x.code === y.code, detail: diff || (x.code !== y.code ? `code ${x.code} vs ${y.code}` : '') });
  } catch (e) {
    results.push({ p, pass: false, detail: 'ERR ' + e.message });
  }
}

console.log('\n===== Express 版 vs Cloudflare Pages 快照版：接口一致性 =====');
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.p.padEnd(34)} ${r.pass ? '' : '<<< ' + r.detail}`);
const pass = results.filter((r) => r.pass).length;
console.log('-------------------------------------------------------------');
console.log(`合计 ${results.length} 项，通过 ${pass}，失败 ${results.length - pass}\n`);
if (pass !== results.length) process.exit(1);
