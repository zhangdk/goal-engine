import Database from 'better-sqlite3';
import type { Policy } from '../../../shared/types.js';
import { DEFAULT_AGENT_ID } from '../agent-context.js';

type PolicyRow = {
  id: string;
  agent_id: string;
  goal_id: string;
  preferred_next_step: string | null;
  avoid_strategies: string;
  must_check_before_retry: string;
  updated_at: string;
};

function rowToPolicy(row: PolicyRow): Policy {
  return {
    id: row.id,
    agentId: row.agent_id,
    goalId: row.goal_id,
    preferredNextStep: row.preferred_next_step ?? undefined,
    avoidStrategies: JSON.parse(row.avoid_strategies),
    mustCheckBeforeRetry: JSON.parse(row.must_check_before_retry),
    updatedAt: row.updated_at,
  };
}

export class PolicyRepo {
  constructor(private db: Database.Database) {}

  /** 幂等 upsert：一个 goal 只有一条当前策略快照。 */
  upsert(policy: Omit<Policy, 'agentId'> & { agentId?: string }): void {
    const agentId = policy.agentId ?? DEFAULT_AGENT_ID;
    this.db
      .prepare(
        `INSERT INTO policies (id, agent_id, goal_id, preferred_next_step, avoid_strategies, must_check_before_retry, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(agent_id, goal_id) DO UPDATE SET
           id                     = excluded.id,
           preferred_next_step    = excluded.preferred_next_step,
           avoid_strategies       = excluded.avoid_strategies,
           must_check_before_retry = excluded.must_check_before_retry,
           updated_at             = excluded.updated_at`
      )
      .run(
        policy.id,
        agentId,
        policy.goalId,
        policy.preferredNextStep ?? null,
        JSON.stringify(policy.avoidStrategies),
        JSON.stringify(policy.mustCheckBeforeRetry),
        policy.updatedAt
      );
  }

  getByGoal(goalId: string): Policy | null;
  getByGoal(agentId: string, goalId: string): Policy | null;
  getByGoal(first: string, second?: string): Policy | null {
    const agentId = second ? first : DEFAULT_AGENT_ID;
    const goalId = second ?? first;
    const row = this.db
      .prepare(`SELECT * FROM policies WHERE agent_id = ? AND goal_id = ?`)
      .get(agentId, goalId) as PolicyRow | undefined;
    return row ? rowToPolicy(row) : null;
  }
}
