// 规则层：所有判定与计算均为确定性规则（不使用 LLM），保证可解释、可复现、可追溯。
// 依据 03-事件状态机定义.md 的 P7 / P8 / P9。

/** 演示数据截止日：固定值，保证权重与过期判定可复现。 */
export const AS_OF = '2026-08-25';

/** 来源权威等级 → 权重系数（P8） */
export const SOURCE_W = { 5: 1.0, 4: 0.8, 3: 0.6, 2: 0.4, 1: 0.2 };

/** 证据类型系数（P7） */
export const TYPE_COEF = { fact: 1.0, opinion: 0.7, speculation: 0.5, rumor: 0.25 };

/** 事件类型有效期（天，P6） */
export const VALIDITY_DAYS = { guidance: 90, contract: 180, penalty: 365, equity: 180, ma: 180, other: 365 };

export const EVENT_TYPE_CN = {
  guidance: '业绩预告/快报', contract: '重大合同/中标', penalty: '监管处罚/问询',
  equity: '增减持/回购', ma: '并购重组', other: '其他',
};

export const EVIDENCE_TYPE_CN = { fact: '事实', opinion: '观点', speculation: '推测', rumor: '传闻' };

export function daysBetween(from, to) {
  const a = new Date(String(from).slice(0, 10));
  const b = new Date(String(to).slice(0, 10));
  return Math.max(0, Math.round((b - a) / 86400000));
}

/** 时效因子（P8）：7 日内 1.0 / 30 日内 0.8 / 90 日内 0.5 / 更早 0.3 */
export function timeFactor(days) {
  if (days <= 7) return 1.0;
  if (days <= 30) return 0.8;
  if (days <= 90) return 0.5;
  return 0.3;
}

/** 证据权重（P8）：w_source × c_type × d_time × 100，并给出可解释明细 */
export function evidenceWeight(sourceLevel, evidenceType, discloseTime, asOf = AS_OF) {
  const w_source = SOURCE_W[sourceLevel] ?? 0.2;
  const c_type = TYPE_COEF[evidenceType] ?? 0.5;
  const days = discloseTime ? daysBetween(discloseTime, asOf) : 0;
  const d_time = discloseTime ? timeFactor(days) : 1.0;
  return {
    weight: Math.round(w_source * c_type * d_time * 100),
    detail: { w_source, c_type, d_time, days: discloseTime ? days : null },
  };
}

/** 事件置信度（P9）：最强证据 × 0.6 + 证据均值 × 0.4 */
export function eventConfidence(weights) {
  if (!weights.length) return 0;
  const max = Math.max(...weights);
  const avg = weights.reduce((a, b) => a + b, 0) / weights.length;
  return Math.round(max * 0.6 + avg * 0.4);
}

// ---- 文本判定规则（P2/P3/P5 的事实性判定词）----
const RUMOR_RE = /据传|传闻|网传|知情人士|消息称|疑似|市场消息|小道消息|未经证实/;
const SPEC_RE = /或将|有望|预计|可能|拟|计划|筹备|正在考虑|传闻称/;
const OPINION_RE = /看好|评级|观点|分析师|我们认为|维持|上调|下调|点评/;
export const DENY_RE = /不属实|未筹划|澄清|否认|不存在|不实|无此事|未有|纯属/;
export const CORRECT_RE = /更正|修正|勘误|更正公告/;
export const CONFIRM_RE = /已完成|获批|批复|已签署|已交割|正式落地|核准|已生效/;

/** 证据四分类（P7） */
export function classifyEvidence(text, sourceType) {
  if (sourceType === 'report') return 'opinion';
  if (sourceType === 'announcement' || sourceType === 'interaction') return 'fact';
  if (RUMOR_RE.test(text)) return 'rumor';
  if (SPEC_RE.test(text)) return 'speculation';
  if (OPINION_RE.test(text)) return 'opinion';
  return 'speculation';
}

export const isDeny = (t) => DENY_RE.test(t);
export const isCorrect = (t) => CORRECT_RE.test(t);
export const isConfirm = (t) => CONFIRM_RE.test(t);

/** 影响方向判定（结论用；不含任何买卖建议） */
const POS_RE = /中标|获批|增长|超预期|增持|回购|签署|完成|上调|预增|利好/;
const NEG_RE = /处罚|亏损|下滑|减持|终止|失败|问询|违规|下调|预减|立案/;

export function impactDirection(text, status) {
  if (status === 'denied') return 'uncertain';
  const pos = POS_RE.test(text);
  const neg = NEG_RE.test(text);
  if (pos && !neg) return 'positive';
  if (neg && !pos) return 'negative';
  return 'neutral';
}

export const DIRECTION_CN = { positive: '正面', negative: '负面', neutral: '中性', uncertain: '不确定' };
export const STATUS_CN = {
  rumor: '传闻', disclosed: '已披露', confirmed: '已确认',
  denied: '已否认', corrected: '已更正', expired: '已过期',
};
