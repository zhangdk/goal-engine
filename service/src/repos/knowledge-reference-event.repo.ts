import Database from 'better-sqlite3';
import type { KnowledgeReferenceEvent } from '../../../shared/types.js';

type KnowledgeReferenceEventRow = {
  id: string;
  agent_id: string;
  goal_id: string;
  retry_check_event_id: string | null;
  knowledge_ids: string;
  promotion_ids: string;
  decision_surface: 'recovery_packet' | 'retry_guard';
  created_at: string;
};

function rowToReferenceEvent(row: KnowledgeReferenceEventRow): KnowledgeReferenceEvent {
  return {
    id: row.id,
    agentId: row.agent_id,
    goalId: row.goal_id,
    retryCheckEventId: row.retry_check_event_id ?? undefined,
    knowledgeIds: JSON.parse(row.knowledge_ids) as string[],
    promotionIds: JSON.parse(row.promotion_ids) as string[],
    decisionSurface: row.decision_surface,
    createdAt: row.created_at,
  };
}

export class KnowledgeReferenceEventRepo {
  constructor(private db: Database.Database) {}

  create(event: KnowledgeReferenceEvent): void {
    this.db.prepare(`
      INSERT INTO knowledge_reference_events (
        id,
        agent_id,
        goal_id,
        retry_check_event_id,
        knowledge_ids,
        promotion_ids,
        decision_surface,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.id,
      event.agentId,
      event.goalId,
      event.retryCheckEventId ?? null,
      JSON.stringify(event.knowledgeIds),
      JSON.stringify(event.promotionIds),
      event.decisionSurface,
      event.createdAt
    );
  }

  listByGoal(agentId: string, goalId: string, limit = 20): KnowledgeReferenceEvent[] {
    const rows = this.db.prepare(`
      SELECT * FROM knowledge_reference_events
      WHERE agent_id = ? AND goal_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(agentId, goalId, Math.min(Math.max(limit, 1), 100)) as KnowledgeReferenceEventRow[];
    return rows.map(rowToReferenceEvent);
  }
}
