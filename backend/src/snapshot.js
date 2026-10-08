// 快照导出：把已构建好的数据库内容导出为 JSON，供 Cloudflare Pages Functions 使用。
// 生成命令：node src/snapshot.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { initDb } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// 输出为 JS 模块（Cloudflare Workers/Pages 运行时不便直接 import JSON）
const OUT = path.join(__dirname, '..', '..', 'cf', 'snapshot.js');

/** 需要导出的表（顺序即外键依赖顺序） */
export const TABLES = [
  'target', 'raw_document', 'event', 'event_document', 'evidence',
  'event_version', 'event_state_log', 'conclusion', 'notification', 'impact_metric',
];

export function exportSnapshot(db, extra = {}) {
  const tables = {};
  for (const t of TABLES) tables[t] = db.prepare(`SELECT * FROM ${t}`).all();
  return { generated_at: new Date().toISOString(), ...extra, tables };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = initDb();
  const snap = exportSnapshot(db, { source: 'LLM 抽取（kimi-k2.6）' });
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT,
    '// 自动生成，请勿手改：由 backend/src/snapshot.js 从已跑通的数据库导出\n'
    + '// 重新生成：cd backend && node src/snapshot.js\n'
    + 'export default ' + JSON.stringify(snap) + ';\n',
    'utf8');
  console.log('快照已导出 ->', OUT);
  for (const t of TABLES) console.log('  ' + t.padEnd(18) + snap.tables[t].length + ' 行');
}
