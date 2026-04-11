import type { AdapterClient } from '../client.js';
import type { Attempt, FailureType } from '../../../shared/types.js';

type AttemptInput = {
  goalId: string;
  stage: string;
  actionTaken: string;
  strategyTags: string[];
  result: 'success' | 'partial' | 'failure';
  failureType?: FailureType;
  confidence?: number;
  nextHypothesis?: string;
};

type AttemptSnake = {
  id: string;
  goal_id: string;
  stage: string;
  action_taken: string;
  strategy_tags: string[];
  result: string;
  failure_type?: string;
  confidence?: number;
  next_hypothesis?: string;
  created_at: string;
};

function toCamel(raw: AttemptSnake): Attempt {
  return {
    id: raw.id,
    goalId: raw.goal_id,
    stage: raw.stage,
    actionTaken: raw.action_taken,
    strategyTags: raw.strategy_tags,
    result: raw.result as Attempt['result'],
    failureType: raw.failure_type as FailureType | undefined,
    confidence: raw.confidence,
    nextHypothesis: raw.next_hypothesis,
    createdAt: raw.created_at,
  };
}

export async function attemptAppend(client: AdapterClient, input: AttemptInput): Promise<Attempt> {
  const raw = await client.post<AttemptSnake>('/api/v1/attempts', {
    goal_id: input.goalId,
    stage: input.stage,
    action_taken: input.actionTaken,
    strategy_tags: input.strategyTags,
    result: input.result,
    failure_type: input.failureType,
    confidence: input.confidence,
    next_hypothesis: input.nextHypothesis,
  });
  return toCamel(raw);
}
