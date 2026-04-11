import type { AdapterClient } from '../client.js';
import type { RetryGuardResult } from '../../../shared/types.js';

type RetryGuardInput = {
  goalId: string;
  plannedAction: string;
  whatChanged: string;
  strategyTags: string[];
  policyAcknowledged: boolean;
};

type RetryGuardSnake = {
  allowed: boolean;
  reason: string;
  warnings: string[];
  tag_overlap_rate?: number;
};

export async function retryGuardCheck(
  client: AdapterClient,
  input: RetryGuardInput
): Promise<RetryGuardResult> {
  const raw = await client.post<RetryGuardSnake>('/api/v1/retry-guard/check', {
    goal_id: input.goalId,
    planned_action: input.plannedAction,
    what_changed: input.whatChanged,
    strategy_tags: input.strategyTags,
    policy_acknowledged: input.policyAcknowledged,
  });

  return {
    allowed: raw.allowed,
    reason: raw.reason as RetryGuardResult['reason'],
    warnings: raw.warnings,
    tagOverlapRate: raw.tag_overlap_rate,
  };
}
