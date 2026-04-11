import Database from 'better-sqlite3';
import type { RecoveryEvent } from '../../../shared/types.js';
import { DEFAULT_AGENT_ID } from '../agent-context.js';

type RecoveryEventRow = {
  id: string;
  agent_id: string;
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
    agentId: row.agent_id,
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

  create(event: Omit<RecoveryEvent, 'agentId'> & { agentId?: string }): void {
    const agentId = event.agentId ?? DEFAULT_AGENT_ID;
    this.db.prepare(
      `INSERT INTO recovery_events
         (id, agent_id, goal_id, goal_title, current_stage, summary, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      event.id,
      agentId,
      event.goalId,
      event.goalTitle,
      event.currentStage,
      event.summary,
      event.source,
      event.createdAt
    );
  }

  listByGoal(goalId: string, limit?: number): RecoveryEvent[];
  listByGoal(agentId: string, goalId: string, limit?: number): RecoveryEvent[];
  listByGoal(first: string, second?: string | number, third = 20): RecoveryEvent[] {
    const agentId = typeof second === 'string' ? first : DEFAULT_AGENT_ID;
    const goalId = typeof second === 'string' ? second : first;
    const limit = typeof second === 'number' ? second : third;
    const rows = this.db.prepare(
      `SELECT * FROM recovery_events
       WHERE agent_id = ? AND goal_id = ?
       ORDER BY created_at DESC
       LIMIT ?`
    ).all(agentId, goalId, Math.min(limit, 100)) as RecoveryEventRow[];

    return rows.map(rowToRecoveryEvent);
  }
}
