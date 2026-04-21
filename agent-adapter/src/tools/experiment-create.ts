import type { Experiment } from '../../../shared/types.js';
import type { AdapterClient } from '../client.js';
import { experimentToCamel, type ExperimentSnake } from './experiment-shape.js';

export type ExperimentCreateInput = {
  goalId: string;
  stage: string;
  hypothesis: string;
  actionPlan: string;
  expectedSignal: string;
  costLevel: Experiment['costLevel'];
  boundaryLevel: Experiment['boundaryLevel'];
  whyDifferent: string;
  status: Experiment['status'];
};

export async function experimentCreate(client: AdapterClient, input: ExperimentCreateInput): Promise<Experiment> {
  const raw = await client.post<ExperimentSnake>('/api/v1/experiments', {
    goal_id: input.goalId,
    stage: input.stage,
    hypothesis: input.hypothesis,
    action_plan: input.actionPlan,
    expected_signal: input.expectedSignal,
    cost_level: input.costLevel,
    boundary_level: input.boundaryLevel,
    why_different: input.whyDifferent,
    status: input.status,
  });
  return experimentToCamel(raw);
}
