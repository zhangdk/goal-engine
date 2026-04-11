/**
 * RetryGuardService — 启发式重试执行门
 *
 * 决策树（按优先级顺序，遇到阻断立即返回）：
 *
 *   ┌─ policy_acknowledged = false?
 *   │   └── BLOCK: policy_not_acknowledged
 *   │
 *   ├─ strategy_tags ∩ avoid_strategies ≠ ∅?
 *   │   └── BLOCK: blocked_strategy_overlap
 *   │
 *   ├─ 无 latestFailureAttempt?
 *   │   └── ALLOW: allowed（无历史参照）
 *   │
 *   ├─ 存在最小行为变化？
 *   │   ├── 有新 strategy_tag （未出现在上次失败 attempt 中）→ ALLOW
 *   │   ├── whatChanged 含明确变化关键词 → ALLOW
 *   │   └── 否则 → BLOCK: no_meaningful_change
 *   │
 *   └── 默认 ALLOW
 *
 * 规则说明：
 * - 不用 embedding，不用 LLM，只用可解释启发式
 * - 高度相似 = tags 完全相同 OR 交集比例 >= 0.7 且 whatChanged 不明确
 * - 明确变化关键词：子任务/subtask、新工具/new tool、新输入/new input、
 *   新搜索/new search、外部帮助/external help
 */

import type { Attempt, Policy, RetryGuardReason, RetryGuardResult } from '../../../shared/types.js';

export type RetryGuardCheckInput = {
  policyAcknowledged: boolean;
  strategyTags: string[];
  whatChanged: string;
  policy: Policy;
  latestFailureAttempt: Attempt | null;
  /** 可选：连续同类失败类型，用于 repeated_failure_without_downgrade 检测 */
  consecutiveFailureType?: string;
};

/** whatChanged 中代表明确变化的关键词（中英双语）。 */
const MEANINGFUL_CHANGE_KEYWORDS = [
  '更小子任务', '小子任务', 'smaller subtask', 'subtask',
  '新工具', 'new tool', '切换到新工具', '替代',
  '新输入', '新输入材料', 'new input', 'new material', '引入了',
  '新搜索路径', 'new search path', '切换到新搜索',
  '外部帮助', 'external help', '请求帮助', '向', '咨询',
];

function hasMeaningfulChange(whatChanged: string): boolean {
  if (!whatChanged || whatChanged.trim() === '') return false;
  const lower = whatChanged.toLowerCase();
  return MEANINGFUL_CHANGE_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()));
}

/**
 * 计算当前 strategy_tags 与上次失败 attempt tags 的交集比例。
 * 分母取当前 tags 的长度；若当前 tags 为空，返回 0。
 */
function computeOverlapRate(currentTags: string[], priorTags: string[]): number {
  if (currentTags.length === 0) return 0;
  const priorSet = new Set(priorTags);
  const intersection = currentTags.filter(t => priorSet.has(t));
  return intersection.length / currentTags.length;
}

function isHighlySimilar(currentTags: string[], priorTags: string[], whatChanged: string): boolean {
  const overlapRate = computeOverlapRate(currentTags, priorTags);

  // 完全相同
  if (overlapRate === 1 && currentTags.length === priorTags.length) return true;

  // overlap >= 0.7 且 whatChanged 不明确
  if (overlapRate >= 0.7 && !hasMeaningfulChange(whatChanged)) return true;

  return false;
}

export class RetryGuardService {
  check(input: RetryGuardCheckInput): RetryGuardResult {
    const {
      policyAcknowledged,
      strategyTags,
      whatChanged,
      policy,
      latestFailureAttempt,
    } = input;

    const warnings: string[] = [];

    // 1. policy 必须已确认
    if (!policyAcknowledged) {
      return { allowed: false, reason: 'policy_not_acknowledged', warnings };
    }

    // 2. strategy_tags 不能命中 avoid_strategies
    const avoidSet = new Set(policy.avoidStrategies);
    const hasOverlap = strategyTags.some(t => avoidSet.has(t));
    if (hasOverlap) {
      return { allowed: false, reason: 'blocked_strategy_overlap', warnings };
    }

    // 3. 若无历史失败参照，直接允许
    if (!latestFailureAttempt) {
      return { allowed: true, reason: 'allowed', warnings };
    }

    const priorTags = latestFailureAttempt.strategyTags;
    const overlapRate = computeOverlapRate(strategyTags, priorTags);

    const hasNewTag = strategyTags.some(t => !priorTags.includes(t));
    const meaningfulChange = hasMeaningfulChange(whatChanged);

    // 4. 连续同类失败检查（优先于 tag 相似度检查）：
    //    若 consecutiveFailureType 存在且无降维信号 → repeated_failure_without_downgrade
    if (input.consecutiveFailureType && !hasNewTag && !meaningfulChange) {
      return {
        allowed: false,
        reason: 'repeated_failure_without_downgrade',
        warnings,
        tagOverlapRate: overlapRate,
      };
    }

    // 5. 高度相似（完全相同 or overlap >= 0.7）且无明确变化 → no_meaningful_change
    if (isHighlySimilar(strategyTags, priorTags, whatChanged) && !hasNewTag && !meaningfulChange) {
      return {
        allowed: false,
        reason: 'no_meaningful_change',
        warnings,
        tagOverlapRate: overlapRate,
      };
    }

    // 6. 有新 tag 或明确变化 → 允许
    if (hasNewTag || meaningfulChange) {
      return {
        allowed: true,
        reason: 'allowed',
        warnings,
        tagOverlapRate: overlapRate,
      };
    }

    // 7. 默认允许
    return {
      allowed: true,
      reason: 'allowed',
      warnings,
      tagOverlapRate: overlapRate,
    };
  }
}
