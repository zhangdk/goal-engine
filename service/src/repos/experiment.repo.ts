import Database from 'better-sqlite3';
import type { Experiment } from '../../../shared/types.js';

type ExperimentRow = {
  id: string;
  agent_id: string;
  goal_id: string;
  stage: string;
  hypothesis: string;
  action_plan: string;
  expected_signal: string;
  cost_level: string;
  boundary_level: string;
  why_different: string;
  status: string;
  created_at: string;
  updated_at: string;
};

function rowToExperiment(row: ExperimentRow): Experiment {
  return {
    id: row.id,
    agentId: row.agent_id,
    goalId: row.goal_id,
    stage: row.stage,
    hypothesis: row.hypothesis,
    actionPlan: row.action_plan,
    expectedSignal: row.expected_signal,
    costLevel: row.cost_level as Experiment['costLevel'],
    boundaryLevel: row.boundary_level as Experiment['boundaryLevel'],
    whyDifferent: row.why_different,
    status: row.status as Experiment['status'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class ExperimentRepo {
  constructor(private db: Database.Database) {}

  ensureAgent(agentId: string, displayName = agentId): void {
    this.db.prepare(
      `INSERT OR IGNORE INTO agents (id, display_name, created_at)
       VALUES (?, ?, ?)`
    ).run(agentId, displayName, new Date().toISOString());
  }

  create(experiment: Experiment): void {
    this.ensureAgent(experiment.agentId);
    this.db.prepare(
      `INSERT INTO experiments (
        id,
        agent_id,
        goal_id,
        stage,
        hypothesis,
        action_plan,
        expected_signal,
        cost_level,
        boundary_level,
        why_different,
        status,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      experiment.id,
      experiment.agentId,
      experiment.goalId,
      experiment.stage,
      experiment.hypothesis,
      experiment.actionPlan,
      experiment.expectedSignal,
      experiment.costLevel,
      experiment.boundaryLevel,
      experiment.whyDifferent,
      experiment.status,
      experiment.createdAt,
      experiment.updatedAt
    );
  }

  getById(agentId: string, id: string): Experiment | null {
    const row = this.db.prepare(
      `SELECT * FROM experiments WHERE agent_id = ? AND id = ?`
    ).get(agentId, id) as ExperimentRow | undefined;
    return row ? rowToExperiment(row) : null;
  }

  listByGoal(agentId: string, goalId: string): Experiment[] {
    const rows = this.db.prepare(
      `SELECT * FROM experiments
       WHERE agent_id = ? AND goal_id = ?
       ORDER BY created_at DESC, updated_at DESC`
    ).all(agentId, goalId) as ExperimentRow[];
    return rows.map(rowToExperiment);
  }

  getActiveByGoal(agentId: string, goalId: string): Experiment | null {
    const row = this.db.prepare(
      `SELECT * FROM experiments
       WHERE agent_id = ? AND goal_id = ? AND status = 'active'
       ORDER BY updated_at DESC, created_at DESC
       LIMIT 1`
    ).get(agentId, goalId) as ExperimentRow | undefined;
    return row ? rowToExperiment(row) : null;
  }

  update(
    agentId: string,
    id: string,
    patch: Partial<
      Pick<
        Experiment,
        'status' | 'actionPlan' | 'expectedSignal' | 'whyDifferent' | 'boundaryLevel' | 'costLevel' | 'stage'
      >
    >
  ): Experiment | null {
    const sets: string[] = [];
    const values: Array<string> = [];

    if (patch.status !== undefined) {
      sets.push('status = ?');
      values.push(patch.status);
    }
    if (patch.actionPlan !== undefined) {
      sets.push('action_plan = ?');
      values.push(patch.actionPlan);
    }
    if (patch.expectedSignal !== undefined) {
      sets.push('expected_signal = ?');
      values.push(patch.expectedSignal);
    }
    if (patch.whyDifferent !== undefined) {
      sets.push('why_different = ?');
      values.push(patch.whyDifferent);
    }
    if (patch.boundaryLevel !== undefined) {
      sets.push('boundary_level = ?');
      values.push(patch.boundaryLevel);
    }
    if (patch.costLevel !== undefined) {
      sets.push('cost_level = ?');
      values.push(patch.costLevel);
    }
    if (patch.stage !== undefined) {
      sets.push('stage = ?');
      values.push(patch.stage);
    }

    const updatedAt = new Date().toISOString();
    sets.push('updated_at = ?');
    values.push(updatedAt);
    values.push(agentId, id);

    const result = this.db.prepare(
      `UPDATE experiments SET ${sets.join(', ')} WHERE agent_id = ? AND id = ?`
    ).run(...values);

    if (result.changes === 0) {
      return null;
    }

    return this.getById(agentId, id);
  }
}
