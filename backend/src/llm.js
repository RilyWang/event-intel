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
6. event_type 描述的是【该文本所涉及的那个事件】的类型，而不是文本本身的语气：
   - 澄清、否认、更正、进展更新类文本，**必须取它所针对的那个事件的类型**。
     例如"关于收购传闻的澄清公告"→ ma；"关于中标金额的更正公告"→ contract。
   - 只有当文本确实不涉及下列任何一类事件时，才填 other。
   - 取值：guidance=业绩预告/快报；contract=重大合同/中标；penalty=监管处罚/问询；
     equity=增减持/回购；ma=并购重组/收购；other=其它。

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

async function callOnce(messages, cfg, useJsonMode) {
  const url = cfg.base.replace(/\/+$/, '') + '/chat/completions';
  const body = { model: cfg.model, messages };
  if (useJsonMode) body.response_format = { type: 'json_object' };
  // temperature 按需发送：部分模型（如 kimi-k2.6）只接受固定值，写死会导致 400
  if (Number.isFinite(cfg.temperature)) body.temperature = cfg.temperature;

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`LLM HTTP ${res.status} ${t.slice(0, 160)}`);
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
  let jsonMode = true;
  for (let attempt = 1; attempt <= 3; attempt++) { // 重试 1 次（F-04 P6）+ JSON 模式降级 1 次
    let text;
    try {
      text = await callOnce(messages, cfg, jsonMode);
    } catch (e) {
      lastError = e.name === 'AbortError' ? `超时（${cfg.timeoutMs}ms）` : e.message;
      // 该模型不支持 response_format 时，去掉该参数再试一次（提示词已要求只输出 JSON）
      if (jsonMode && /LLM HTTP 4\d\d/.test(lastError)) {
        jsonMode = false;
        continue;
      }
      continue;
    }
    const parsed = parseAndValidate(text, doc, targets);
    if (parsed.error) {
      lastError = parsed.error;
      continue;
    }
    return { ...parsed, method: 'llm', attempts: attempt, json_mode: jsonMode };
  }
  return { fallback: true, error: lastError };
}
