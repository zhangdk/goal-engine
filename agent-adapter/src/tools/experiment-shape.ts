import type { Experiment } from '../../../shared/types.js';

export type ExperimentSnake = {
  id: string;
  agent_id?: string;
  goal_id: string;
  stage: string;
  hypothesis: string;
  action_plan: string;
  expected_signal: string;
  cost_level: Experiment['costLevel'];
  boundary_level: Experiment['boundaryLevel'];
  why_different: string;
  status: Experiment['status'];
  created_at: string;
  updated_at: string;
};

export function experimentToCamel(raw: ExperimentSnake): Experiment {
  return {
    id: raw.id,
    agentId: raw.agent_id ?? 'goal-engine-demo',
    goalId: raw.goal_id,
    stage: raw.stage,
    hypothesis: raw.hypothesis,
    actionPlan: raw.action_plan,
    expectedSignal: raw.expected_signal,
    costLevel: raw.cost_level,
    boundaryLevel: raw.boundary_level,
    whyDifferent: raw.why_different,
    status: raw.status,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}
