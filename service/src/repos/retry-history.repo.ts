import Database from 'better-sqlite3';
import type { RetryCheckEvent, RetryGuardReason } from '../../../shared/types.js';

type RetryCheckEventRow = {
  id: string;
  goal_id: string;
  planned_action: string;
  what_changed: string;
  strategy_tags: string;
  policy_acknowledged: number;
  allowed: number;
  reason: string;
  warnings: string;
  tag_overlap_rate: number | null;
  created_at: string;
};

function rowToRetryCheckEvent(row: RetryCheckEventRow): RetryCheckEvent {
  return {
    id: row.id,
    goalId: row.goal_id,
    plannedAction: row.planned_action,
    whatChanged: row.what_changed,
    strategyTags: JSON.parse(row.strategy_tags) as string[],
    policyAcknowledged: row.policy_acknowledged === 1,
    allowed: row.allowed === 1,
    reason: row.reason as RetryGuardReason,
    warnings: JSON.parse(row.warnings) as string[],
    tagOverlapRate: row.tag_overlap_rate ?? undefined,
    createdAt: row.created_at,
  };
}

export class RetryHistoryRepo {
  constructor(private db: Database.Database) {}

  create(event: RetryCheckEvent): void {
    this.db.prepare(
      `INSERT INTO retry_check_events
         (id, goal_id, planned_action, what_changed, strategy_tags, policy_acknowledged, allowed, reason, warnings, tag_overlap_rate, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      event.id,
      event.goalId,
      event.plannedAction,
      event.whatChanged,
      JSON.stringify(event.strategyTags),
      event.policyAcknowledged ? 1 : 0,
      event.allowed ? 1 : 0,
      event.reason,
      JSON.stringify(event.warnings),
      event.tagOverlapRate ?? null,
      event.createdAt
    );
  }

  listByGoal(goalId: string, limit = 20): RetryCheckEvent[] {
    const rows = this.db.prepare(
      `SELECT * FROM retry_check_events
       WHERE goal_id = ?
       ORDER BY created_at DESC
       LIMIT ?`
    ).all(goalId, Math.min(limit, 100)) as RetryCheckEventRow[];

    return rows.map(rowToRetryCheckEvent);
  }
}
