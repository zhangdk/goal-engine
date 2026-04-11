import Database from 'better-sqlite3';
import type { RecoveryEvent } from '../../../shared/types.js';

type RecoveryEventRow = {
  id: string;
  goal_id: string;
  goal_title: string;
  current_stage: string;
  summary: string;
  source: string;
  created_at: string;
};

function rowToRecoveryEvent(row: RecoveryEventRow): RecoveryEvent {
  return {
    id: row.id,
    goalId: row.goal_id,
    goalTitle: row.goal_title,
    currentStage: row.current_stage,
    summary: row.summary,
    source: row.source as RecoveryEvent['source'],
    createdAt: row.created_at,
  };
}

export class RecoveryEventRepo {
  constructor(private db: Database.Database) {}

  create(event: RecoveryEvent): void {
    this.db.prepare(
      `INSERT INTO recovery_events
         (id, goal_id, goal_title, current_stage, summary, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      event.id,
      event.goalId,
      event.goalTitle,
      event.currentStage,
      event.summary,
      event.source,
      event.createdAt
    );
  }

  listByGoal(goalId: string, limit = 20): RecoveryEvent[] {
    const rows = this.db.prepare(
      `SELECT * FROM recovery_events
       WHERE goal_id = ?
       ORDER BY created_at DESC
       LIMIT ?`
    ).all(goalId, Math.min(limit, 100)) as RecoveryEventRow[];

    return rows.map(rowToRecoveryEvent);
  }
}
