import Database from 'better-sqlite3';
import type { Reflection } from '../../../shared/types.js';
import { DEFAULT_AGENT_ID } from '../agent-context.js';

type ReflectionRow = {
  id: string;
  agent_id: string;
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
    agentId: row.agent_id,
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

  create(reflection: Omit<Reflection, 'agentId'> & { agentId?: string }): void {
    const agentId = reflection.agentId ?? DEFAULT_AGENT_ID;
    this.db
      .prepare(
        `INSERT INTO reflections
           (id, agent_id, goal_id, attempt_id, summary, root_cause, must_change, avoid_strategy, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        reflection.id,
        agentId,
        reflection.goalId,
        reflection.attemptId,
        reflection.summary,
        reflection.rootCause,
        reflection.mustChange,
        reflection.avoidStrategy ?? null,
        reflection.createdAt
      );
  }

  getByAttemptId(attemptId: string): Reflection | null;
  getByAttemptId(agentId: string, attemptId: string): Reflection | null;
  getByAttemptId(first: string, second?: string): Reflection | null {
    const agentId = second ? first : DEFAULT_AGENT_ID;
    const attemptId = second ?? first;
    const row = this.db
      .prepare(`SELECT * FROM reflections WHERE agent_id = ? AND attempt_id = ?`)
      .get(agentId, attemptId) as ReflectionRow | undefined;
    return row ? rowToReflection(row) : null;
  }

  listByGoal(goalId: string): Reflection[];
  listByGoal(agentId: string, goalId: string): Reflection[];
  listByGoal(first: string, second?: string): Reflection[] {
    const agentId = second ? first : DEFAULT_AGENT_ID;
    const goalId = second ?? first;
    const rows = this.db
      .prepare(`SELECT * FROM reflections WHERE agent_id = ? AND goal_id = ? ORDER BY created_at ASC`)
      .all(agentId, goalId) as ReflectionRow[];
    return rows.map(rowToReflection);
  }

  getLatest(goalId: string): Reflection | null;
  getLatest(agentId: string, goalId: string): Reflection | null;
  getLatest(first: string, second?: string): Reflection | null {
    const agentId = second ? first : DEFAULT_AGENT_ID;
    const goalId = second ?? first;
    const row = this.db
      .prepare(
        `SELECT * FROM reflections WHERE agent_id = ? AND goal_id = ? ORDER BY created_at DESC LIMIT 1`
      )
      .get(agentId, goalId) as ReflectionRow | undefined;
    return row ? rowToReflection(row) : null;
  }
}
