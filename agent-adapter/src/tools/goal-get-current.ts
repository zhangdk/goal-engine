import type { AdapterClient } from '../client.js';
import type { Goal } from '../../../shared/types.js';

type GoalSnake = {
  id: string;
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

export async function goalGetCurrent(client: AdapterClient): Promise<Goal> {
  const raw = await client.get<GoalSnake>('/api/v1/goals/current');
  return toCamel(raw);
}
