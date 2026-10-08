// 规则层：所有判定与计算均为确定性规则（不使用 LLM），保证可解释、可复现、可追溯。
// 依据 03-事件状态机定义.md 的 P7 / P8 / P9。

/** 演示数据截止日：固定值，保证权重与过期判定可复现。
 *  取最新一条数据（真实公开公告 2026-10-09）之后，避免出现"数据晚于截止日"。 */
export const AS_OF = '2026-10-10';

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
// 注意：不可用裸词「不存在」/「不实」——A股公告的标准免责表述里常见
//（如"公司与招标人不存在关联关系""没有虚假记载"），会造成大面积误判。
export const DENY_RE = /澄清|不属实|未筹划|纯属|无此事|予以否认|否认上述|传闻不实|报道不实|不存在所述/;
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

// 事件类型规则：按「标题 → 正文」两轮匹配。
// 标题最精确（真实公告标题必含事件性质），正文常在无关处提到"合同"等词，故不能只看正文。
const TYPE_RULES = [
  [/中标|合同|订单|框架协议|采购|签署/, 'contract'],
  [/业绩预告|业绩快报|业绩预盈|业绩预亏|业绩预增|预增|预减|净利润|营业收入|年度报告|半年度报告|季度报告|定期报告/, 'guidance'],
  [/收购|并购|重组|股权转让|资产购买|要约|拟购买/, 'ma'],
  [/处罚|问询|违规|立案|警示|谴责|监管函|关注函/, 'penalty'],
  [/增持|减持|回购|股份转让/, 'equity'],
];
// 传闻/澄清/否认类：其「针对的事件类型」常在标题里说不清（如"关于市场传闻的澄清公告"）。
// 必须先归为 other，否则传闻本体与其澄清会被拆成两个事件——这正是"同一事件识别"要避免的。
// 注意：更正类不在此列，因为更正公告标题通常点明被更正的事项（如"关于项目中标公告的更正公告"→仍属中标）。
const AMBIGUOUS_TITLE_RE = /传闻|澄清|否认|风险提示/;

/** 事件类型判定（传闻/澄清优先归 other；其次按标题；最后才扫正文） */
export function ruleEventType(text, title = '') {
  if (AMBIGUOUS_TITLE_RE.test(title)) return 'other';
  for (const [re, ty] of TYPE_RULES) if (re.test(title)) return ty;
  for (const [re, ty] of TYPE_RULES) if (re.test(text)) return ty;
  return 'other';
}

/** 影响方向判定（结论用；不含任何买卖建议） */
const POS_RE = /中标|获批|增长|超预期|增持|回购|签署|完成|上调|预增|预盈|利好/;
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
