/**
 * reflection_generate — 本地 helper（不调用 service）
 *
 * v0 决策：reflection 生成属于 adapter/本地侧能力。
 * service 只接受"已生成好的 reflection payload"。
 *
 * 这个 helper 提供结构化的本地模板生成，
 * 后续如果需要 LLM 辅助生成，可在此处扩展，
 * 不影响 service 侧接口。
 */

import type { FailureType } from '../../../shared/types.js';

export type ReflectionGenerateInput = {
  attemptSummary: string;
  failureType: FailureType;
  strategyTags: string[];
};

export type ReflectionDraft = {
  summary: string;
  rootCause: string;
  mustChange: string;
  avoidStrategy?: string;
};

/**
 * 根据失败 attempt 信息，生成结构化 reflection 草稿。
 * v0 使用基于失败类型的模板规则，不依赖 LLM。
 */
export function reflectionGenerate(input: ReflectionGenerateInput): ReflectionDraft {
  const { attemptSummary, failureType, strategyTags } = input;

  const rootCauseMap: Record<FailureType, string> = {
    tool_error: '工具调用失败或返回了无效结果',
    capability_gap: '当前能力不足以完成该子任务',
    strategy_mismatch: '当前策略与任务需求不匹配',
    external_blocker: '遇到外部阻碍，无法继续推进',
    resource_limit: '资源（时间/工具/上下文）耗尽',
    validation_fail: '输出未通过验证条件',
    stuck_loop: '陷入重复循环，无进展',
    ambiguous_goal: '目标描述不清晰，无法有效行动',
  };

  const mustChangeMap: Record<FailureType, string> = {
    tool_error: '切换到其他工具或更小范围的操作',
    capability_gap: '分解为更小子任务，或请求外部帮助',
    strategy_mismatch: '重新评估策略方向，选择更匹配的方法',
    external_blocker: '绕过阻碍或请求外部介入',
    resource_limit: '缩小任务范围，降低资源消耗',
    validation_fail: '检查输出标准，修正执行方式',
    stuck_loop: '强制切换路径，引入新输入材料',
    ambiguous_goal: '先澄清目标，再重新规划行动',
  };

  // 如果有 strategyTags，将第一个作为 avoid_strategy 候选
  const avoidStrategy = strategyTags.length > 0 ? strategyTags[0] : undefined;

  return {
    summary: attemptSummary,
    rootCause: rootCauseMap[failureType],
    mustChange: mustChangeMap[failureType],
    avoidStrategy,
  };
}
