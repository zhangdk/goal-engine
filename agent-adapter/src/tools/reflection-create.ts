import type { AdapterClient } from '../client.js';
import type { Policy, Reflection } from '../../../shared/types.js';

export type ReflectionCreateInput = {
  goalId: string;
  attemptId: string;
  summary: string;
  rootCause: string;
  mustChange: string;
  avoidStrategy?: string;
};

export type ReflectionCreateResult = {
  reflection: Reflection;
  policy: Policy;
};

type ReflectionSnake = {
  id: string;
  goal_id: string;
  attempt_id: string;
  summary: string;
  root_cause: string;
  must_change: string;
  avoid_strategy?: string;
  created_at: string;
};

type PolicySnake = {
  id: string;
  goal_id: string;
  preferred_next_step?: string;
  avoid_strategies: string[];
  must_check_before_retry: string[];
  updated_at: string;
};

function reflectionToCamel(raw: ReflectionSnake): Reflection {
  return {
    id: raw.id,
    goalId: raw.goal_id,
    attemptId: raw.attempt_id,
    summary: raw.summary,
    rootCause: raw.root_cause,
    mustChange: raw.must_change,
    avoidStrategy: raw.avoid_strategy,
    createdAt: raw.created_at,
  };
}

function policyToCamel(raw: PolicySnake): Policy {
  return {
    id: raw.id,
    goalId: raw.goal_id,
    preferredNextStep: raw.preferred_next_step,
    avoidStrategies: raw.avoid_strategies,
    mustCheckBeforeRetry: raw.must_check_before_retry,
    updatedAt: raw.updated_at,
  };
}

export async function reflectionCreate(
  client: AdapterClient,
  input: ReflectionCreateInput
): Promise<ReflectionCreateResult> {
  const raw = await client.post<{
    reflection: ReflectionSnake;
    policy: PolicySnake;
  }>('/api/v1/reflections', {
    goal_id: input.goalId,
    attempt_id: input.attemptId,
    summary: input.summary,
    root_cause: input.rootCause,
    must_change: input.mustChange,
    avoid_strategy: input.avoidStrategy,
  });

  return {
    reflection: reflectionToCamel(raw.reflection),
    policy: policyToCamel(raw.policy),
  };
}
