import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const SCHEMA_PATH = path.join(__dirname, '..', 'schema.sql');
export const DB_PATH = path.join(__dirname, '..', 'data', 'event-intel.db');

/** 打开数据库并确保表存在（schema.sql 可重复执行）。 */
export function initDb(dbPath = DB_PATH) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  return db;
}

export function nowStamp() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
}

export function tx(db, fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function nextSeqCode(db, table, column, prefix) {
  const row = db.prepare(`SELECT ${column} AS c FROM ${table} ORDER BY id DESC LIMIT 1`).get();
  let n = 1;
  if (row && row.c) {
    const m = String(row.c).match(/(\d+)$/);
    if (m) n = parseInt(m[1], 10) + 1;
  }
  return `${prefix}${String(n).padStart(4, '0')}`;
}
