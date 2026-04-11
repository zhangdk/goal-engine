import Database from 'better-sqlite3';
import type { KnowledgePromotion, KnowledgeVisibility } from '../../../shared/types.js';

type KnowledgePromotionRow = {
  id: string;
  knowledge_id: string;
  visibility: string;
  agent_id: string | null;
  subject: string;
  condition: string;
  summary: string;
  recommendation: string;
  confidence: number;
  support_count: number;
  created_at: string;
  updated_at: string;
};

function rowToPromotion(row: KnowledgePromotionRow): KnowledgePromotion {
  return {
    id: row.id,
    knowledgeId: row.knowledge_id,
    visibility: row.visibility as KnowledgeVisibility,
    agentId: row.agent_id ?? undefined,
    subject: row.subject,
    condition: JSON.parse(row.condition) as Record<string, unknown>,
    summary: row.summary,
    recommendation: row.recommendation,
    confidence: row.confidence,
    supportCount: row.support_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class KnowledgePromotionRepo {
  constructor(private db: Database.Database) {}

  create(promotion: KnowledgePromotion): void {
    this.db.prepare(`
      INSERT INTO knowledge_promotions (
        id,
        knowledge_id,
        visibility,
        agent_id,
        subject,
        condition,
        summary,
        recommendation,
        confidence,
        support_count,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      promotion.id,
      promotion.knowledgeId,
      promotion.visibility,
      promotion.agentId ?? null,
      promotion.subject,
      JSON.stringify(promotion.condition),
      promotion.summary,
      promotion.recommendation,
      promotion.confidence,
      promotion.supportCount,
      promotion.createdAt,
      promotion.updatedAt
    );
  }

  getById(id: string): KnowledgePromotion | null {
    const row = this.db.prepare(
      `SELECT * FROM knowledge_promotions WHERE id = ?`
    ).get(id) as KnowledgePromotionRow | undefined;
    return row ? rowToPromotion(row) : null;
  }

  listSharedForAgent(agentId: string, subjects: string[] = [], limit = 20): KnowledgePromotion[] {
    const clauses = [
      `(visibility = 'global' OR (agent_id = ? AND visibility IN ('private', 'agent')))`,
    ];
    const params: Array<string | number> = [agentId];

    if (subjects.length > 0) {
      clauses.push(`subject IN (${subjects.map(() => '?').join(', ')})`);
      params.push(...subjects);
    }

    params.push(Math.min(Math.max(limit, 1), 100));
    const rows = this.db.prepare(`
      SELECT * FROM knowledge_promotions
      WHERE ${clauses.join(' AND ')}
      ORDER BY updated_at DESC
      LIMIT ?
    `).all(...params) as KnowledgePromotionRow[];
    return rows.map(rowToPromotion);
  }
}
