import Database from 'better-sqlite3';
import type { Attempt, AttemptResult, FailureType } from '../../../shared/types.js';

type AttemptRow = {
  id: string;
  goal_id: string;
  stage: string;
  action_taken: string;
  strategy_tags: string;
  result: string;
  failure_type: string | null;
  confidence: number | null;
  next_hypothesis: string | null;
  created_at: string;
};

function rowToAttempt(row: AttemptRow): Attempt {
  return {
    id: row.id,
    goalId: row.goal_id,
    stage: row.stage,
    actionTaken: row.action_taken,
    strategyTags: JSON.parse(row.strategy_tags),
    result: row.result as AttemptResult,
    failureType: row.failure_type ? (row.failure_type as FailureType) : undefined,
    confidence: row.confidence ?? undefined,
    nextHypothesis: row.next_hypothesis ?? undefined,
    createdAt: row.created_at,
  };
}

export class AttemptRepo {
  constructor(private db: Database.Database) {}

  create(attempt: Omit<Attempt, 'failureType'> & { failureType?: FailureType }): void {
    // result=failure 时 failureType 必须存在（schema CHECK 会捕获）
    this.db
      .prepare(
        `INSERT INTO attempts
           (id, goal_id, stage, action_taken, strategy_tags, result, failure_type, confidence, next_hypothesis, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        attempt.id,
        attempt.goalId,
        attempt.stage,
        attempt.actionTaken,
        JSON.stringify(attempt.strategyTags),
        attempt.result,
        attempt.failureType ?? null,
        attempt.confidence ?? null,
        attempt.nextHypothesis ?? null,
        attempt.createdAt
      );
  }

  listByGoal(
    goalId: string,
    opts?: { limit?: number; result?: string; stage?: string }
  ): Attempt[] {
    const clauses = ['goal_id = ?'];
    const params: (string | number)[] = [goalId];

    if (opts?.result) {
      clauses.push('result = ?');
      params.push(opts.result);
    }
    if (opts?.stage) {
      clauses.push('stage = ?');
      params.push(opts.stage);
    }

    const limit = Math.min(opts?.limit ?? 20, 100);
    params.push(limit);

    const rows = this.db
      .prepare(
        `SELECT * FROM attempts WHERE ${clauses.join(' AND ')} ORDER BY created_at DESC LIMIT ?`
      )
      .all(...params) as AttemptRow[];
    return rows.map(rowToAttempt);
  }

  getById(id: string): Attempt | null {
    const row = this.db
      .prepare(`SELECT * FROM attempts WHERE id = ?`)
      .get(id) as AttemptRow | undefined;
    return row ? rowToAttempt(row) : null;
  }

  getLatestFailure(goalId: string): Attempt | null {
    const row = this.db
      .prepare(
        `SELECT * FROM attempts
         WHERE goal_id = ? AND result = 'failure'
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(goalId) as AttemptRow | undefined;
    return row ? rowToAttempt(row) : null;
  }

  getLatestMeaningfulProgress(goalId: string): Attempt | null {
    const row = this.db
      .prepare(
        `SELECT * FROM attempts
         WHERE goal_id = ? AND result IN ('success', 'partial')
         ORDER BY created_at DESC LIMIT 1`
      )
      .get(goalId) as AttemptRow | undefined;
    return row ? rowToAttempt(row) : null;
  }
}
