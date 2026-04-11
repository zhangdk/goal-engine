import type { AdapterClient } from '../client.js';
import type { Policy } from '../../../shared/types.js';

type PolicySnake = {
  id: string;
  agent_id?: string;
  goal_id: string;
  preferred_next_step?: string;
  avoid_strategies: string[];
  must_check_before_retry: string[];
  updated_at: string;
};

function toCamel(raw: PolicySnake): Policy {
  return {
    id: raw.id,
    agentId: raw.agent_id ?? 'goal-engine-demo',
    goalId: raw.goal_id,
    preferredNextStep: raw.preferred_next_step,
    avoidStrategies: raw.avoid_strategies,
    mustCheckBeforeRetry: raw.must_check_before_retry,
    updatedAt: raw.updated_at,
  };
}

export async function policyGetCurrent(client: AdapterClient, goalId: string): Promise<Policy> {
  const raw = await client.get<PolicySnake>(`/api/v1/policies/current?goal_id=${encodeURIComponent(goalId)}`);
  return toCamel(raw);
}
