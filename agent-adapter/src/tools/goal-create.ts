import type { AdapterClient } from '../client.js';
import type { Goal, GoalContract } from '../../../shared/types.js';

export type GoalContractInput = {
  outcome: string;
  successEvidence: string[];
  deadlineAt?: string;
  autonomyLevel: 0 | 1 | 2 | 3 | 4;
  boundaryRules: string[];
  stopConditions: string[];
  strategyGuidance: string[];
  permissionBoundary: string[];
};

type GoalCreateInput = {
  title: string;
  successCriteria: string[];
  stopConditions?: string[];
  currentStage?: string;
  priority?: number;
  replaceActiveGoal?: boolean;
  contract?: GoalContractInput;
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
  contract?: GoalContractSnake;
};

type GoalContractSnake = {
  id: string;
  agent_id?: string;
  goal_id: string;
  outcome: string;
  success_evidence: string[];
  deadline_at?: string;
  autonomy_level: number;
  boundary_rules: string[];
  stop_conditions: string[];
  strategy_guidance: string[];
  permission_boundary: string[];
  created_at: string;
  updated_at: string;
};

export type GoalCreateResult = Goal & {
  contract?: GoalContract;
};

function contractToCamel(raw: GoalContractSnake): GoalContract {
  return {
    id: raw.id,
    agentId: raw.agent_id ?? 'goal-engine-demo',
    goalId: raw.goal_id,
    outcome: raw.outcome,
    successEvidence: raw.success_evidence,
    deadlineAt: raw.deadline_at,
    autonomyLevel: raw.autonomy_level as GoalContract['autonomyLevel'],
    boundaryRules: raw.boundary_rules,
    stopConditions: raw.stop_conditions,
    strategyGuidance: raw.strategy_guidance,
    permissionBoundary: raw.permission_boundary,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

function toCamel(raw: GoalSnake): GoalCreateResult {
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
    contract: raw.contract ? contractToCamel(raw.contract) : undefined,
  };
}

export async function goalCreate(client: AdapterClient, input: GoalCreateInput): Promise<GoalCreateResult> {
  const raw = await client.post<GoalSnake>('/api/v1/goals', {
    title: input.title,
    success_criteria: input.successCriteria,
    stop_conditions: input.stopConditions ?? [],
    current_stage: input.currentStage ?? 'initial',
    priority: input.priority ?? 1,
    replace_active: input.replaceActiveGoal ?? false,
    contract: input.contract
      ? {
          outcome: input.contract.outcome,
          success_evidence: input.contract.successEvidence,
          deadline_at: input.contract.deadlineAt,
          autonomy_level: input.contract.autonomyLevel,
          boundary_rules: input.contract.boundaryRules,
          stop_conditions: input.contract.stopConditions,
          strategy_guidance: input.contract.strategyGuidance,
          permission_boundary: input.contract.permissionBoundary,
        }
      : undefined,
  });

  return toCamel(raw);
}
