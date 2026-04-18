import Database from 'better-sqlite3';
import type { GoalContract } from '../../../shared/types.js';

type GoalContractRow = {
  id: string;
  agent_id: string;
  goal_id: string;
  outcome: string;
  success_evidence: string;
  deadline_at: string | null;
  autonomy_level: number;
  boundary_rules: string;
  stop_conditions: string;
  strategy_guidance: string;
  permission_boundary: string;
  created_at: string;
  updated_at: string;
};

function rowToGoalContract(row: GoalContractRow): GoalContract {
  return {
    id: row.id,
    agentId: row.agent_id,
    goalId: row.goal_id,
    outcome: row.outcome,
    successEvidence: JSON.parse(row.success_evidence),
    deadlineAt: row.deadline_at ?? undefined,
    autonomyLevel: row.autonomy_level as GoalContract['autonomyLevel'],
    boundaryRules: JSON.parse(row.boundary_rules),
    stopConditions: JSON.parse(row.stop_conditions),
    strategyGuidance: JSON.parse(row.strategy_guidance),
    permissionBoundary: JSON.parse(row.permission_boundary),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class GoalContractRepo {
  constructor(private db: Database.Database) {}

  create(contract: GoalContract): void {
    this.db.prepare(
      `INSERT INTO goal_contracts (
        id,
        agent_id,
        goal_id,
        outcome,
        success_evidence,
        deadline_at,
        autonomy_level,
        boundary_rules,
        stop_conditions,
        strategy_guidance,
        permission_boundary,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      contract.id,
      contract.agentId,
      contract.goalId,
      contract.outcome,
      JSON.stringify(contract.successEvidence),
      contract.deadlineAt ?? null,
      contract.autonomyLevel,
      JSON.stringify(contract.boundaryRules),
      JSON.stringify(contract.stopConditions),
      JSON.stringify(contract.strategyGuidance),
      JSON.stringify(contract.permissionBoundary),
      contract.createdAt,
      contract.updatedAt
    );
  }

  getByGoal(agentId: string, goalId: string): GoalContract | null {
    const row = this.db.prepare(
      `SELECT * FROM goal_contracts WHERE agent_id = ? AND goal_id = ?`
    ).get(agentId, goalId) as GoalContractRow | undefined;
    return row ? rowToGoalContract(row) : null;
  }
}
