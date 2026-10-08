// 初始化数据库并走一遍主链路（F-01~F-08），生成可演示数据。
import crypto from 'node:crypto';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { initDb, DB_PATH, nowStamp } from './db.js';
import { ingestDocument } from './pipeline.js';
import { TARGETS, DOCUMENTS, IMPACT } from './samples.js';

export async function seed(dbPath = DB_PATH) {
  const db = initDb(dbPath);
  // 清空数据（不删文件：Windows 下服务端可能仍持有句柄）
  const tables = ['notification', 'impact_metric', 'conclusion', 'event_state_log', 'event_version',
    'evidence', 'event_document', 'event', 'raw_document', 'target'];
  for (const t of tables) db.exec(`DELETE FROM ${t}`);
  db.exec('DELETE FROM sqlite_sequence');

  // 关注标的
  const insTarget = db.prepare(
    'INSERT INTO target (target_code, target_name, market, alias, active) VALUES (?,?,?,?,?)'
  );
  for (const t of TARGETS) insTarget.run(t.target_code, t.target_name, t.market, t.alias, t.active);
  const targets = db.prepare('SELECT * FROM target').all();

  // 按披露时间顺序处理文档（事件随时间演化）
  const docs = [...DOCUMENTS].sort((a, b) => a.disclose_time.localeCompare(b.disclose_time));
  const results = [];
  for (const d of docs) {
    const hash = crypto.createHash('sha256').update(d.title + d.content).digest('hex').slice(0, 32);
    results.push({ doc: d.doc_code, ...(await ingestDocument(db, { ...d, hash }, targets)) });
  }

  // 影响验证数据
  const insImpact = db.prepare(
    'INSERT INTO impact_metric (event_id, target_code, metric_date, close_price, pct_change, volume, source, anchor) VALUES (?,?,?,?,?,?,?,?)'
  );
  const events = db.prepare('SELECT * FROM event').all();
  for (const m of IMPACT) {
    const evt = events.find((e) => e.subject_code === m.target_code && e.event_type !== 'guidance')
      || events.find((e) => e.subject_code === m.target_code);
    if (evt) insImpact.run(evt.id, m.target_code, m.metric_date, m.close_price, m.pct_change, m.volume, m.source, m.anchor);
  }

  return { db, results };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { db } = await seed();
  const n = (sql) => db.prepare(sql).get().c;
  console.log('seed 完成 @', nowStamp());
  console.log('  targets        :', n('SELECT COUNT(*) c FROM target'));
  console.log('  documents      :', n('SELECT COUNT(*) c FROM raw_document'));
  console.log('  events         :', n('SELECT COUNT(*) c FROM event'));
  console.log('  evidence       :', n('SELECT COUNT(*) c FROM evidence'));
  console.log('  versions       :', n('SELECT COUNT(*) c FROM event_version'));
  console.log('  state logs     :', n('SELECT COUNT(*) c FROM event_state_log'));
  console.log('  conclusions    :', n('SELECT COUNT(*) c FROM conclusion'));
  console.log('  notifications  :', n('SELECT COUNT(*) c FROM notification'));
  console.log('--- 事件状态 ---');
  for (const e of db.prepare('SELECT event_code, event_type, subject_name, status, event_confidence FROM event ORDER BY id').all()) {
    console.log(`  ${e.event_code} | ${e.subject_name} | ${e.event_type} | ${e.status} | conf=${e.event_confidence}`);
  }
}
