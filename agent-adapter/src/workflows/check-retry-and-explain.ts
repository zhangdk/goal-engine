import type { AdapterClient } from '../client.js';
import { retryGuardCheck } from '../tools/retry-guard-check.js';

export type CheckRetryAndExplainInput = {
  goalId: string;
  plannedAction: string;
  whatChanged: string;
  strategyTags: string[];
  policyAcknowledged: boolean;
};

export type CheckRetryAndExplainResult = {
  allowed: boolean;
  rawReason: string;
  explanation: string;
};

const reasonMessages: Record<string, string> = {
  allowed: '可以继续，这次尝试看起来和上次失败路径有明确区别。',
  policy_not_acknowledged: '先确认你已经阅读并接受当前策略建议，再继续重试。',
  blocked_strategy_overlap: '这次尝试与旧风险策略重叠，请参考当前建议调整路径。',
  blocked_no_meaningful_change: '这次重试没有体现足够变化，先说明这次到底改了什么。',
  no_meaningful_change: '这次重试没有体现足够变化，先说明这次到底改了什么。',
  blocked_repeated_failure_pattern: '你还在重复同类失败模式，先切换输入、工具或子任务。',
  repeated_failure_without_downgrade: '你还在重复同类失败模式，先切换输入、工具或子任务。',
};

export async function checkRetryAndExplain(
  client: AdapterClient,
  input: CheckRetryAndExplainInput
): Promise<CheckRetryAndExplainResult> {
  const result = await retryGuardCheck(client, input);

  return {
    allowed: result.allowed,
    rawReason: result.reason,
    explanation: [
      reasonMessages[result.reason] ?? '当前重试检查没有通过，请先查看当前策略建议。',
      ...(result.advisories && result.advisories.length > 0
        ? ['参考认知：', ...result.advisories.map((advisory) => `- ${advisory}`)]
        : []),
    ].join('\n'),
  };
}
