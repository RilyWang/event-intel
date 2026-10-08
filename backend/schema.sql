-- 投资事件情报与证据时间线 · 建表 SQL
-- 依据：04-数据库Schema.md（锁定文件）。可重复执行。

CREATE TABLE IF NOT EXISTS target (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  target_code   TEXT NOT NULL UNIQUE,
  target_name   TEXT NOT NULL,
  market        TEXT NOT NULL DEFAULT 'A',
  alias         TEXT,
  active        INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS raw_document (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_code      TEXT NOT NULL UNIQUE,
  source_type   TEXT NOT NULL,
  source_name   TEXT NOT NULL,
  source_level  INTEGER NOT NULL,
  title         TEXT NOT NULL,
  content       TEXT NOT NULL,
  url           TEXT,
  disclose_time TEXT,
  crawl_time    TEXT NOT NULL,
  fetched_via   TEXT NOT NULL,
  hash          TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS event (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  event_code          TEXT NOT NULL UNIQUE,
  title               TEXT NOT NULL,
  event_type          TEXT NOT NULL,
  subject_name        TEXT NOT NULL,
  subject_code        TEXT,
  key_elements        TEXT,
  event_time          TEXT,
  status              TEXT NOT NULL DEFAULT 'rumor',
  event_confidence    INTEGER NOT NULL DEFAULT 0,
  first_source_doc_id INTEGER,
  created_time        TEXT NOT NULL,
  update_time         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS event_document (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id         INTEGER NOT NULL,
  doc_id           INTEGER NOT NULL,
  merge_reason     TEXT NOT NULL,
  merge_confidence INTEGER NOT NULL,
  merged_by        TEXT NOT NULL,
  linked_time      TEXT NOT NULL,
  UNIQUE(event_id, doc_id)
);

CREATE TABLE IF NOT EXISTS evidence (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  evidence_code TEXT NOT NULL UNIQUE,
  event_id      INTEGER NOT NULL,
  doc_id        INTEGER NOT NULL,
  content       TEXT NOT NULL,
  quote         TEXT NOT NULL,
  evidence_type TEXT NOT NULL,
  source_level  INTEGER NOT NULL,
  weight        INTEGER NOT NULL,
  weight_detail TEXT NOT NULL,
  evidence_time TEXT,
  created_time  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS event_version (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id       INTEGER NOT NULL,
  version_no     INTEGER NOT NULL,
  change_type    TEXT NOT NULL,
  change_summary TEXT NOT NULL,
  trigger_doc_id INTEGER,
  snapshot       TEXT NOT NULL,
  update_time    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS event_state_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id    INTEGER NOT NULL,
  from_status TEXT,
  to_status   TEXT NOT NULL,
  rule_code   TEXT NOT NULL,
  reason      TEXT NOT NULL,
  evidence_ids TEXT,
  changed_time TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conclusion (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id      INTEGER NOT NULL,
  target_code   TEXT NOT NULL,
  direction     TEXT NOT NULL,
  confidence    INTEGER NOT NULL,
  summary       TEXT NOT NULL,
  evidence_ids  TEXT NOT NULL,
  is_current    INTEGER NOT NULL DEFAULT 1,
  version_no    INTEGER NOT NULL DEFAULT 1,
  created_time  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notification (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id      INTEGER NOT NULL,
  trigger_rule  TEXT NOT NULL,
  title         TEXT NOT NULL,
  body          TEXT NOT NULL,
  change_detail TEXT,
  is_read       INTEGER NOT NULL DEFAULT 0,
  created_time  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS impact_metric (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id    INTEGER NOT NULL,
  target_code TEXT NOT NULL,
  metric_date TEXT NOT NULL,
  close_price REAL,
  pct_change  REAL,
  volume      REAL,
  source      TEXT NOT NULL,
  anchor      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_evidence_event ON evidence(event_id);
CREATE INDEX IF NOT EXISTS idx_version_event ON event_version(event_id);
CREATE INDEX IF NOT EXISTS idx_doc_event ON event_document(event_id);
CREATE INDEX IF NOT EXISTS idx_conclusion_event ON conclusion(event_id);
