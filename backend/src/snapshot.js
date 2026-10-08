// 快照导出：把已构建好的数据库内容导出为 JSON/JS 模块，供 Cloudflare Pages Functions 使用。
// 生成命令：node src/snapshot.js
//
// 注意：抽取方式（LLM / 规则）从数据本身推导，不写死，
//       避免在 LLM 不可用时（Key 失效等）快照仍声称"由 LLM 抽取"。
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

/** 从事件表统计实际使用的抽取方式，作为快照的"数据来源"元信息 */
export function extractionMeta(db) {
  const rows = db.prepare('SELECT key_elements FROM event').all();
  let llm = 0; let rule = 0;
  for (const r of rows) {
    let m = 'rule';
    try { m = JSON.parse(r.key_elements || '{}').extract_method || 'rule'; } catch { /* 保持 rule */ }
    if (m === 'llm') llm += 1; else rule += 1;
  }
  return {
    llm_events: llm,
    rule_events: rule,
    label: llm > 0 && rule === 0 ? 'LLM 抽取'
      : llm > 0 ? `混合（LLM ${llm} / 规则 ${rule}）`
        : '规则抽取（LLM 未启用或不可用）',
  };
}

export function exportSnapshot(db, extra = {}) {
  const tables = {};
  for (const t of TABLES) tables[t] = db.prepare(`SELECT * FROM ${t}`).all();
  return { generated_at: new Date().toISOString(), extraction: extractionMeta(db), ...extra, tables };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = initDb();
  const snap = exportSnapshot(db);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT,
    '// 自动生成，请勿手改：由 backend/src/snapshot.js 从已跑通的数据库导出\n'
    + '// 重新生成：cd backend && node src/snapshot.js\n'
    + 'export default ' + JSON.stringify(snap) + ';\n',
    'utf8');
  console.log('快照已导出 ->', OUT);
  console.log('抽取方式：', snap.extraction.label,
    `(llm=${snap.extraction.llm_events}, rule=${snap.extraction.rule_events})`);
  for (const t of TABLES) console.log('  ' + t.padEnd(18) + snap.tables[t].length + ' 行');
}
