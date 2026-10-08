// API 服务：前后端分离的后端（前端为独立 Vite 应用，通过 /api/* 取数）
import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initDb, DB_PATH, nowStamp } from './db.js';
import { AS_OF, EVENT_TYPE_CN, EVIDENCE_TYPE_CN, STATUS_CN, DIRECTION_CN } from './rules.js';
import { seed } from './seed.js';
import { loadEnv, llmStatus } from './env.js';

const PORT = process.env.PORT || 8899;
// 注：8787 已被环境内其它服务占用，故默认使用 8899。

const __dirname = path.dirname(fileURLToPath(import.meta.url));

loadEnv(); // 读取 backend/.env（若存在）

// 首次启动若无库文件，自动初始化（TC-EX-004）
if (!fs.existsSync(DB_PATH)) await seed(DB_PATH);
const db = initDb();

const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

const ok = (res, data) => res.json({ code: 0, message: 'ok', data });
const fail = (res, code, message) => res.status(200).json({ code, message, data: null });

app.get('/api/health', (req, res) => ok(res, {
  status: 'up', time: nowStamp(), as_of: AS_OF, db: DB_PATH,
  llm: llmStatus(),
  data_sources: { ifind_mcp: 'not_configured', fuyao: 'not_configured', public_web: 'available', sample: 'available' },
}));

// LLM 接入状态（供界面/自检查看：是否已配置、当前抽取走 LLM 还是规则）
app.get('/api/llm/status', (req, res) => {
  loadEnv(true);
  const before = llmStatus();
  const used = db.prepare(`SELECT COUNT(*) c FROM event WHERE key_elements LIKE '%"extract_method":"llm"%'`).get().c;
  const rule = db.prepare(`SELECT COUNT(*) c FROM event WHERE key_elements LIKE '%"extract_method":"rule"%'`).get().c;
  ok(res, {
    ...before,
    hint: before.available
      ? 'LLM 已配置：新一轮扫描将优先用 LLM 抽取，失败自动回退规则'
      : 'LLM 未配置：当前全部走规则抽取。在 backend/.env 填 LLM_BASE_URL / LLM_API_KEY / LLM_MODEL 后重启生效',
    events_extracted_by_llm: used,
    events_extracted_by_rule: rule,
  });
});

app.get('/api/meta', (req, res) => ok(res, {
  as_of: AS_OF,
  event_type: EVENT_TYPE_CN, evidence_type: EVIDENCE_TYPE_CN,
  status: STATUS_CN, direction: DIRECTION_CN,
  disclaimer: '本平台仅呈现投资事件与公开证据，用于情报整理与追溯，不构成任何投资建议。',
}));

app.get('/api/stats', (req, res) => {
  const c = (sql) => db.prepare(sql).get().c;
  ok(res, {
    targets: c('SELECT COUNT(*) c FROM target'),
    documents: c('SELECT COUNT(*) c FROM raw_document'),
    events: c('SELECT COUNT(*) c FROM event'),
    evidence: c('SELECT COUNT(*) c FROM evidence'),
    pending_notifications: c('SELECT COUNT(*) c FROM notification WHERE is_read=0'),
    by_status: db.prepare('SELECT status, COUNT(*) c FROM event GROUP BY status').all(),
  });
});

app.get('/api/targets', (req, res) => ok(res,
  db.prepare('SELECT * FROM target WHERE active=1 ORDER BY target_code').all()));

app.get('/api/events', (req, res) => {
  const { status, type, q } = req.query;
  let sql = `SELECT e.*, (SELECT COUNT(*) FROM evidence v WHERE v.event_id=e.id) AS evidence_count,
             (SELECT COUNT(*) FROM raw_document rd JOIN event_document ed ON ed.doc_id=rd.id WHERE ed.event_id=e.id) AS doc_count
             FROM event e WHERE 1=1`;
  const p = [];
  if (status) { sql += ' AND e.status=?'; p.push(status); }
  if (type) { sql += ' AND e.event_type=?'; p.push(type); }
  if (q) { sql += ' AND (e.title LIKE ? OR e.subject_name LIKE ?)'; p.push(`%${q}%`, `%${q}%`); }
  sql += ' ORDER BY e.update_time DESC';
  ok(res, db.prepare(sql).all(...p));
});

app.get('/api/events/:code', (req, res) => {
  const ev = db.prepare('SELECT * FROM event WHERE event_code=?').get(req.params.code);
  if (!ev) return fail(res, 404, '事件不存在');

  const timeline = db.prepare(`
    SELECT rd.id, rd.doc_code, rd.source_type, rd.source_name, rd.source_level, rd.title, rd.content,
           rd.url, rd.disclose_time, rd.crawl_time, rd.fetched_via,
           ed.merge_reason, ed.merge_confidence,
           ev2.evidence_code, ev2.evidence_type, ev2.weight, ev2.quote, ev2.weight_detail
    FROM event_document ed
    JOIN raw_document rd ON rd.id = ed.doc_id
    LEFT JOIN evidence ev2 ON ev2.doc_id = rd.id AND ev2.event_id = ed.event_id
    WHERE ed.event_id = ?
    ORDER BY rd.disclose_time ASC`).all(ev.id);

  ok(res, {
    event: ev,
    first_source: ev.first_source_doc_id
      ? db.prepare('SELECT * FROM raw_document WHERE id=?').get(ev.first_source_doc_id) : null,
    timeline,
    evidence: db.prepare(`SELECT e.*, rd.source_name, rd.disclose_time, rd.url AS doc_url
                          FROM evidence e JOIN raw_document rd ON rd.id=e.doc_id
                          WHERE e.event_id=? ORDER BY e.weight DESC`).all(ev.id),
    versions: db.prepare('SELECT * FROM event_version WHERE event_id=? ORDER BY version_no').all(ev.id),
    state_logs: db.prepare('SELECT * FROM event_state_log WHERE event_id=? ORDER BY id').all(ev.id),
    conclusions: db.prepare('SELECT * FROM conclusion WHERE event_id=? ORDER BY version_no DESC').all(ev.id),
    impact: db.prepare('SELECT * FROM impact_metric WHERE event_id=? ORDER BY metric_date').all(ev.id),
    notifications: db.prepare('SELECT * FROM notification WHERE event_id=? ORDER BY id DESC').all(ev.id),
  });
});

app.get('/api/documents', (req, res) => {
  ok(res, db.prepare(`
    SELECT rd.*, e.event_code, e.subject_name, e.status,
           CASE WHEN ed.id IS NULL THEN 1 ELSE 0 END AS unstructured
    FROM raw_document rd
    LEFT JOIN event_document ed ON ed.doc_id = rd.id
    LEFT JOIN event e ON e.id = ed.event_id
    ORDER BY rd.disclose_time DESC`).all());
});

app.get('/api/notifications', (req, res) => ok(res,
  db.prepare(`SELECT n.*, e.event_code, e.title AS event_title, e.status
              FROM notification n JOIN event e ON e.id=n.event_id
              ORDER BY n.created_time DESC, n.id DESC`).all()));

app.post('/api/notifications/:id/read', (req, res) => {
  db.prepare('UPDATE notification SET is_read=1 WHERE id=?').run(req.params.id);
  ok(res, { id: Number(req.params.id), is_read: 1 });
});

// 重新跑一遍主链路（演示用；等价于定时/手动采集触发）
app.post('/api/pipeline/run', async (req, res) => {
  try {
    await seed(DB_PATH);
    ok(res, { rerun: true, time: nowStamp(), llm: llmStatus().available ? 'llm' : 'rule' });
  } catch (e) {
    fail(res, 500, `流水线执行失败：${e.message}`);
  }
});

// 生产形态：同域托管前端构建产物（frontend/dist），单进程即整站
// 开发时前端仍走独立 Vite dev server（5199），通过代理访问 /api
const DIST_DIR = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR));
  // SPA 回退：非 /api 的路径一律返回 index.html
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(path.join(DIST_DIR, 'index.html')));
  console.log(`[backend] 已托管前端构建产物: ${DIST_DIR}`);
} else {
  console.log('[backend] 未发现 frontend/dist，仅提供 API（前端请用 npm run dev）');
}

app.use((err, req, res, next) => {
  console.error(err);
  fail(res, 500, `服务异常：${err.message}`);
});

app.listen(PORT, () => {
  console.log(`[backend] 事件情报 API 已启动: http://127.0.0.1:${PORT}/api/health  (AS_OF=${AS_OF})`);
});
