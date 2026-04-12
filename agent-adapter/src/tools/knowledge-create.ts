import type { AdapterClient } from '../client.js';
import type { Knowledge } from '../../../shared/types.js';

export type KnowledgeCreateInput = {
  goalId: string;
  sourceAttemptId?: string;
  context: string;
  observation: string;
  hypothesis: string;
  implication: string;
  relatedStrategyTags: string[];
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

function toCamel(raw: KnowledgeSnake): Knowledge {
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

export async function knowledgeCreate(
  client: AdapterClient,
  input: KnowledgeCreateInput
): Promise<Knowledge> {
  const raw = await client.post<KnowledgeSnake>('/api/v1/knowledge', {
    goal_id: input.goalId,
    source_attempt_id: input.sourceAttemptId,
    context: input.context,
    observation: input.observation,
    hypothesis: input.hypothesis,
    implication: input.implication,
    related_strategy_tags: input.relatedStrategyTags,
  });

  return toCamel(raw);
}
