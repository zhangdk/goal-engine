import Database from 'better-sqlite3';
import type { Knowledge } from '../../../shared/types.js';

type KnowledgeRow = {
  id: string;
  agent_id: string;
  goal_id: string;
  source_attempt_id: string | null;
  context: string;
  observation: string;
  hypothesis: string;
  implication: string;
  related_strategy_tags: string;
  created_at: string;
};

function rowToKnowledge(row: KnowledgeRow): Knowledge {
  return {
    id: row.id,
    agentId: row.agent_id,
    goalId: row.goal_id,
    sourceAttemptId: row.source_attempt_id ?? undefined,
    context: row.context,
    observation: row.observation,
    hypothesis: row.hypothesis,
    implication: row.implication,
    relatedStrategyTags: JSON.parse(row.related_strategy_tags) as string[],
    createdAt: row.created_at,
  };
}

export class KnowledgeRepo {
  constructor(private db: Database.Database) {}

  create(knowledge: Knowledge): void {
    this.db.prepare(`
      INSERT INTO knowledge (
        id,
        agent_id,
        goal_id,
        source_attempt_id,
        context,
        observation,
        hypothesis,
        implication,
        related_strategy_tags,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      knowledge.id,
      knowledge.agentId,
      knowledge.goalId,
      knowledge.sourceAttemptId ?? null,
      knowledge.context,
      knowledge.observation,
      knowledge.hypothesis,
      knowledge.implication,
      JSON.stringify(knowledge.relatedStrategyTags),
      knowledge.createdAt
    );
  }

  getById(agentId: string, id: string): Knowledge | null {
    const row = this.db.prepare(
      `SELECT * FROM knowledge WHERE agent_id = ? AND id = ?`
    ).get(agentId, id) as KnowledgeRow | undefined;
    return row ? rowToKnowledge(row) : null;
  }

  listByGoal(agentId: string, goalId: string, limit = 20): Knowledge[] {
    const rows = this.db.prepare(`
      SELECT * FROM knowledge
      WHERE agent_id = ? AND goal_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(agentId, goalId, Math.min(Math.max(limit, 1), 100)) as KnowledgeRow[];
    return rows.map(rowToKnowledge);
  }

  listByTags(agentId: string, goalId: string, tags: string[], limit = 20): Knowledge[] {
    const all = this.listByGoal(agentId, goalId, limit);
    if (tags.length === 0) return all;
    const tagSet = new Set(tags);
    return all.filter((item) => item.relatedStrategyTags.some((tag) => tagSet.has(tag)));
  }
}
