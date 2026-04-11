import type { AdapterClient } from '../client.js';
import type { Knowledge, Policy, Reflection } from '../../../shared/types.js';

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
  knowledge?: Knowledge;
};

type ReflectionSnake = {
  id: string;
  agent_id?: string;
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
  agent_id?: string;
  goal_id: string;
  preferred_next_step?: string;
  avoid_strategies: string[];
  must_check_before_retry: string[];
  updated_at: string;
};

type KnowledgeSnake = {
  id: string;
  agent_id?: string;
  goal_id: string;
  source_attempt_id?: string;
  context: string;
  observation: string;
  hypothesis: string;
  implication: string;
  related_strategy_tags: string[];
  created_at: string;
};

function reflectionToCamel(raw: ReflectionSnake): Reflection {
  return {
    id: raw.id,
    agentId: raw.agent_id ?? 'goal-engine-demo',
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
    agentId: raw.agent_id ?? 'goal-engine-demo',
    goalId: raw.goal_id,
    preferredNextStep: raw.preferred_next_step,
    avoidStrategies: raw.avoid_strategies,
    mustCheckBeforeRetry: raw.must_check_before_retry,
    updatedAt: raw.updated_at,
  };
}

function knowledgeToCamel(raw: KnowledgeSnake): Knowledge {
  return {
    id: raw.id,
    agentId: raw.agent_id ?? 'goal-engine-demo',
    goalId: raw.goal_id,
    sourceAttemptId: raw.source_attempt_id,
    context: raw.context,
    observation: raw.observation,
    hypothesis: raw.hypothesis,
    implication: raw.implication,
    relatedStrategyTags: raw.related_strategy_tags,
    createdAt: raw.created_at,
  };
}

export async function reflectionCreate(
  client: AdapterClient,
  input: ReflectionCreateInput
): Promise<ReflectionCreateResult> {
  const raw = await client.post<{
    reflection: ReflectionSnake;
    policy: PolicySnake;
    knowledge?: KnowledgeSnake;
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
    knowledge: raw.knowledge ? knowledgeToCamel(raw.knowledge) : undefined,
  };
}
