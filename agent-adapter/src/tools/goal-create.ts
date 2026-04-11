import type { AdapterClient } from '../client.js';
import type { Goal } from '../../../shared/types.js';

type GoalCreateInput = {
  title: string;
  successCriteria: string[];
  stopConditions?: string[];
  currentStage?: string;
  priority?: number;
  replaceActiveGoal?: boolean;
};

type GoalSnake = {
  id: string;
  agent_id?: string;
  title: string;
  status: string;
  success_criteria: string[];
  stop_conditions: string[];
  priority: number;
  current_stage: string;
  created_at: string;
  updated_at: string;
};

function toCamel(raw: GoalSnake): Goal {
  return {
    id: raw.id,
    agentId: raw.agent_id ?? 'goal-engine-demo',
    title: raw.title,
    status: raw.status as Goal['status'],
    successCriteria: raw.success_criteria,
    stopConditions: raw.stop_conditions,
    priority: raw.priority,
    currentStage: raw.current_stage,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

export async function goalCreate(client: AdapterClient, input: GoalCreateInput): Promise<Goal> {
  const raw = await client.post<GoalSnake>('/api/v1/goals', {
    title: input.title,
    success_criteria: input.successCriteria,
    stop_conditions: input.stopConditions ?? [],
    current_stage: input.currentStage ?? 'initial',
    priority: input.priority ?? 1,
    replace_active: input.replaceActiveGoal ?? false,
  });

  return toCamel(raw);
}
