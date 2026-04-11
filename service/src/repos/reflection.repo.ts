import Database from 'better-sqlite3';
import type { Reflection } from '../../../shared/types.js';

type ReflectionRow = {
  id: string;
  goal_id: string;
  attempt_id: string;
  summary: string;
  root_cause: string;
  must_change: string;
  avoid_strategy: string | null;
  created_at: string;
};

function rowToReflection(row: ReflectionRow): Reflection {
  return {
    id: row.id,
    goalId: row.goal_id,
    attemptId: row.attempt_id,
    summary: row.summary,
    rootCause: row.root_cause,
    mustChange: row.must_change,
    avoidStrategy: row.avoid_strategy ?? undefined,
    createdAt: row.created_at,
  };
}

export class ReflectionRepo {
  constructor(private db: Database.Database) {}

  create(reflection: Reflection): void {
    this.db
      .prepare(
        `INSERT INTO reflections
           (id, goal_id, attempt_id, summary, root_cause, must_change, avoid_strategy, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        reflection.id,
        reflection.goalId,
        reflection.attemptId,
        reflection.summary,
        reflection.rootCause,
        reflection.mustChange,
        reflection.avoidStrategy ?? null,
        reflection.createdAt
      );
  }

  getByAttemptId(attemptId: string): Reflection | null {
    const row = this.db
      .prepare(`SELECT * FROM reflections WHERE attempt_id = ?`)
      .get(attemptId) as ReflectionRow | undefined;
    return row ? rowToReflection(row) : null;
  }

  listByGoal(goalId: string): Reflection[] {
    const rows = this.db
      .prepare(`SELECT * FROM reflections WHERE goal_id = ? ORDER BY created_at ASC`)
      .all(goalId) as ReflectionRow[];
    return rows.map(rowToReflection);
  }

  getLatest(goalId: string): Reflection | null {
    const row = this.db
      .prepare(
        `SELECT * FROM reflections WHERE goal_id = ? ORDER BY created_at DESC LIMIT 1`
      )
      .get(goalId) as ReflectionRow | undefined;
    return row ? rowToReflection(row) : null;
  }
}
