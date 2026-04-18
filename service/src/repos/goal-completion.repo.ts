import Database from 'better-sqlite3';
import type { GoalCompletion } from '../../../shared/types.js';

type GoalCompletionRow = {
  id: string;
  agent_id: string;
  goal_id: string;
  evidence_ids: string;
  summary: string;
  completed_at: string;
};

function rowToGoalCompletion(row: GoalCompletionRow): GoalCompletion {
  return {
    id: row.id,
    agentId: row.agent_id,
    goalId: row.goal_id,
    evidenceIds: JSON.parse(row.evidence_ids),
    summary: row.summary,
    completedAt: row.completed_at,
  };
}

export class GoalCompletionRepo {
  constructor(private db: Database.Database) {}

  create(completion: GoalCompletion): void {
    this.db.prepare(
      `INSERT INTO goal_completions (
        id,
        agent_id,
        goal_id,
        evidence_ids,
        summary,
        completed_at
      ) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      completion.id,
      completion.agentId,
      completion.goalId,
      JSON.stringify(completion.evidenceIds),
      completion.summary,
      completion.completedAt
    );
  }

  getByGoal(agentId: string, goalId: string): GoalCompletion | null {
    const row = this.db.prepare(
      `SELECT * FROM goal_completions WHERE agent_id = ? AND goal_id = ?`
    ).get(agentId, goalId) as GoalCompletionRow | undefined;
    return row ? rowToGoalCompletion(row) : null;
  }
}
