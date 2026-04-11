import Database from 'better-sqlite3';
import type { Goal, GoalStatus } from '../../../shared/types.js';

type GoalRow = {
  id: string;
  title: string;
  status: string;
  success_criteria: string;
  stop_conditions: string;
  priority: number;
  current_stage: string;
  created_at: string;
  updated_at: string;
};

function rowToGoal(row: GoalRow): Goal {
  return {
    id: row.id,
    title: row.title,
    status: row.status as GoalStatus,
    successCriteria: JSON.parse(row.success_criteria),
    stopConditions: JSON.parse(row.stop_conditions),
    priority: row.priority,
    currentStage: row.current_stage,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class GoalRepo {
  constructor(private db: Database.Database) {}

  create(goal: Goal): void {
    this.db
      .prepare(
        `INSERT INTO goals
           (id, title, status, success_criteria, stop_conditions, priority, current_stage, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        goal.id,
        goal.title,
        goal.status,
        JSON.stringify(goal.successCriteria),
        JSON.stringify(goal.stopConditions),
        goal.priority,
        goal.currentStage,
        goal.createdAt,
        goal.updatedAt
      );
  }

  getCurrent(): Goal | null {
    const row = this.db
      .prepare(`SELECT * FROM goals WHERE status = 'active' LIMIT 1`)
      .get() as GoalRow | undefined;
    return row ? rowToGoal(row) : null;
  }

  getById(id: string): Goal | null {
    const row = this.db
      .prepare(`SELECT * FROM goals WHERE id = ?`)
      .get(id) as GoalRow | undefined;
    return row ? rowToGoal(row) : null;
  }

  patch(
    id: string,
    fields: Partial<Pick<Goal, 'status' | 'currentStage' | 'priority' | 'successCriteria' | 'stopConditions'>> & { updatedAt: string }
  ): void {
    const sets: string[] = [];
    const values: (string | number)[] = [];

    if (fields.status !== undefined) {
      sets.push('status = ?');
      values.push(fields.status);
    }
    if (fields.currentStage !== undefined) {
      sets.push('current_stage = ?');
      values.push(fields.currentStage);
    }
    if (fields.priority !== undefined) {
      sets.push('priority = ?');
      values.push(fields.priority);
    }
    if (fields.successCriteria !== undefined) {
      sets.push('success_criteria = ?');
      values.push(JSON.stringify(fields.successCriteria));
    }
    if (fields.stopConditions !== undefined) {
      sets.push('stop_conditions = ?');
      values.push(JSON.stringify(fields.stopConditions));
    }
    sets.push('updated_at = ?');
    values.push(fields.updatedAt);
    values.push(id);

    this.db.prepare(`UPDATE goals SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  }
}
