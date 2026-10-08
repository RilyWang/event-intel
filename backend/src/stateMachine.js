// 事件状态机（03-事件状态机定义.md P1~P6 / P12）
import { isDeny, isCorrect, isConfirm, daysBetween, VALIDITY_DAYS } from './rules.js';

/**
 * 依据「新到证据」计算事件的目标状态。
 * 顺序即规则优先级；返回 rule 编号便于解释。
 */
export function nextStatus(current, ev) {
  const text = `${ev.content} ${ev.quote}`;
  const auth = ev.source_level >= 4;

  // P3 否认（权威来源的否认/澄清）
  if (auth && isDeny(text)) {
    return { status: 'denied', rule: 'P3', reason: '出现权威来源的否认/澄清' };
  }
  // P5 更正
  if (auth && isCorrect(text)) {
    return { status: 'corrected', rule: 'P5', reason: '出现发布方的更正公告' };
  }
  // 已否认/已更正后，出现新的权威非否认证据 → 重新披露
  if (auth && (current === 'denied' || current === 'corrected')) {
    return { status: 'disclosed', rule: 'P1', reason: '新证据重新披露，覆盖此前的否认/更正' };
  }
  // P2 确认 —— P4 守卫：不得由「传闻」直接跳「已确认」
  if (auth && isConfirm(text)) {
    if (current === 'rumor') {
      return { status: 'disclosed', rule: 'P1', reason: 'P4 守卫触发：传闻不得直接确认，先转为已披露' };
    }
    return { status: 'confirmed', rule: 'P2', reason: '出现确认性证据（已完成/获批等）' };
  }
  // P1 披露：权威来源出现
  if (auth && current === 'rumor') {
    return { status: 'disclosed', rule: 'P1', reason: '出现权威来源的公开披露' };
  }
  // 权威来源但当前已是披露态以上：保持
  if (auth && (current === 'disclosed' || current === 'confirmed')) {
    return { status: current, rule: null };
  }
  return { status: current, rule: null };
}

/** P6 过期判定：超过事件类型有效期且无新证据 */
export function checkExpiry(eventType, lastEvidenceTime, asOf) {
  if (!lastEvidenceTime) return null;
  const validity = VALIDITY_DAYS[eventType] ?? 365;
  const days = daysBetween(lastEvidenceTime, asOf);
  if (days > validity) {
    return { status: 'expired', rule: 'P6', reason: `距最后证据 ${days} 天，超过该事件类型有效期 ${validity} 天` };
  }
  return null;
}

/** P12 通知触发判定 */
export function notificationTriggers(prev, next, prevConf, nextConf) {
  const triggers = [];
  if (next === 'denied' || next === 'corrected') {
    triggers.push({ rule: '1', label: '状态变为否认/更正' });
  }
  if (prev.direction && next.direction && prev.direction !== next.direction) {
    triggers.push({ rule: '2', label: '影响方向发生翻转' });
  }
  if (prevConf != null && nextConf != null && Math.abs(nextConf - prevConf) >= 20) {
    triggers.push({ rule: '3', label: `置信度变化 ${prevConf} → ${nextConf}` });
  }
  return triggers;
}

/** P12-4 冲突证据：与既有结论方向相反且权重 ≥ 60 */
export function findConflict(evidenceList, currentDirection) {
  const opposite = currentDirection === 'positive' ? 'negative' : 'positive';
  return evidenceList.filter(
    (e) => e.weight >= 60 && e.direction === opposite
  );
}
