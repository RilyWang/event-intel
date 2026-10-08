// LLM 抽取（F-02 的 AI 分支）。设计原则（见 README §3）：
//   LLM 只做"理解"（抽取），不做"判定"（权重/状态/结论全部走规则）。
//   输出必须通过校验才能入库，尤其 quote 必须是原文子串（防编造，TC-EX-002）。
import { loadEnv, llmConfig, llmAvailable } from './env.js';
import * as R from './rules.js';

const EVENT_TYPES = ['guidance', 'contract', 'penalty', 'equity', 'ma', 'other'];
const EVIDENCE_TYPES = ['fact', 'opinion', 'speculation', 'rumor'];
export const QUOTE_MAX = 140;

const SYSTEM_PROMPT = `你是金融情报结构化抽取助手。从给定的公告/新闻/研报文本中抽取结构化信息。

严格规则：
1. 只输出一个 JSON 对象，不要输出任何解释、Markdown 代码块或多余文字。
2. quote 字段必须是【原文中连续出现的片段】，一字不改，不得超过 140 字。禁止改写、概括或编造。
3. 若文本未提及某字段，用 null；不要猜测。
4. subject_code 必须从给定的 targets 列表中选择；都不匹配则填 null。
5. 不做投资判断、不做涨跌预测。

JSON 结构：
{
  "subject_code": "从 targets 中选，或 null",
  "event_type": "guidance|contract|penalty|equity|ma|other",
  "evidence_type": "fact|opinion|speculation|rumor",
  "amounts": ["如 3.2亿元，无则 []"],
  "event_time": "YYYY-MM-DD 或 null（原文明确提到的发生时间）",
  "quote": "原文连续片段"
}`;

/** 解析并校验 LLM 输出；任一项不合法返回 null（由调用方回退规则抽取） */
export function parseAndValidate(text, doc, targets) {
  let j;
  try {
    const cleaned = String(text).replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    j = JSON.parse(cleaned);
  } catch {
    return { error: 'JSON 解析失败' };
  }
  if (!j || typeof j !== 'object') return { error: '输出不是对象' };

  // quote 必须是原文子串 —— 防编造（TC-EX-002）
  const quote = typeof j.quote === 'string' ? j.quote.trim().slice(0, QUOTE_MAX) : '';
  if (!quote) return { error: '缺少 quote' };
  if (!doc.content.includes(quote) && !doc.title.includes(quote)) {
    return { error: 'quote 不是原文子串（疑似编造），拒绝入库' };
  }

  // 主体必须在 targets 中
  let subject = null;
  if (j.subject_code) {
    subject = targets.find((t) => t.target_code === j.subject_code) || null;
    if (!subject) return { error: `subject_code 不在关注标的中：${j.subject_code}` };
  }

  const eventType = EVENT_TYPES.includes(j.event_type) ? j.event_type : 'other';
  const evidenceType = EVIDENCE_TYPES.includes(j.evidence_type)
    ? j.evidence_type
    : R.classifyEvidence(doc.title + doc.content, doc.source_type);

  const amounts = Array.isArray(j.amounts) ? j.amounts.filter((a) => typeof a === 'string').slice(0, 8) : [];
  const eventTime = typeof j.event_time === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(j.event_time) ? j.event_time : null;

  return { subject, eventType, evidenceType, amounts, eventTime, quote };
}

async function callOnce(messages, cfg) {
  const url = cfg.base.replace(/\/+$/, '') + '/chat/completions';
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature: 0,
        response_format: { type: 'json_object' },
      }),
      signal: ctl.signal,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`LLM HTTP ${res.status} ${t.slice(0, 120)}`);
    }
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? '';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 用 LLM 抽取单篇文档。失败或校验不通过返回 {fallback:true, error}。
 * 契约与 pipeline 的规则抽取一致，便于无缝回退。
 */
export async function extractWithLLM(doc, targets) {
  loadEnv();
  if (!llmAvailable()) return { fallback: true, error: 'LLM 未配置（缺 LLM_BASE_URL / LLM_API_KEY / LLM_MODEL）' };

  const cfg = llmConfig();
  const payload = JSON.stringify({
    title: doc.title,
    content: doc.content,
    source_type: doc.source_type,
    source_name: doc.source_name,
    targets: targets.map((t) => ({
      code: t.target_code,
      name: t.target_name,
      alias: t.alias ? JSON.parse(t.alias) : [],
    })),
  }, null, 0);

  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: payload },
  ];

  let lastError = '';
  for (let attempt = 1; attempt <= 2; attempt++) { // 失败重试 1 次（TC-F04-002 / F-04 P6）
    try {
      const text = await callOnce(messages, cfg);
      const parsed = parseAndValidate(text, doc, targets);
      if (parsed.error) {
        lastError = parsed.error;
        continue;
      }
      return { ...parsed, method: 'llm', attempts: attempt };
    } catch (e) {
      lastError = e.name === 'AbortError' ? `超时（${cfg.timeoutMs}ms）` : e.message;
    }
  }
  return { fallback: true, error: lastError };
}
