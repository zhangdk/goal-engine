import Database from 'better-sqlite3';
import type { GoalAgentAssignment } from '../../../shared/types.js';

type GoalAgentAssignmentRow = {
  id: string;
  goal_id: string;
  agent_id: string;
  agent_name: string;
  workspace: string;
  session: string;
  assignment_reason: string;
  assigned_at: string;
  released_at: string | null;
};

function rowToAssignment(row: GoalAgentAssignmentRow): GoalAgentAssignment {
  return {
    id: row.id,
    goalId: row.goal_id,
    agentId: row.agent_id,
    agentName: row.agent_name,
    workspace: row.workspace,
    session: row.session,
    assignmentReason: row.assignment_reason as GoalAgentAssignment['assignmentReason'],
    assignedAt: row.assigned_at,
    releasedAt: row.released_at ?? undefined,
  };
}

export class GoalAgentAssignmentRepo {
  constructor(private db: Database.Database) {}

  create(assignment: GoalAgentAssignment): void {
    this.db.prepare(
      `INSERT INTO goal_agent_assignments
         (id, goal_id, agent_id, agent_name, workspace, session, assignment_reason, assigned_at, released_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      assignment.id,
      assignment.goalId,
      assignment.agentId,
      assignment.agentName,
      assignment.workspace,
      assignment.session,
      assignment.assignmentReason,
      assignment.assignedAt,
      assignment.releasedAt ?? null
    );
  }

  getOpenByGoal(goalId: string): GoalAgentAssignment | null {
    const row = this.db.prepare(
      `SELECT * FROM goal_agent_assignments
       WHERE goal_id = ? AND released_at IS NULL
       LIMIT 1`
    ).get(goalId) as GoalAgentAssignmentRow | undefined;

    return row ? rowToAssignment(row) : null;
  }

  listByGoal(goalId: string, limit = 20): GoalAgentAssignment[] {
    const rows = this.db.prepare(
      `SELECT * FROM goal_agent_assignments
       WHERE goal_id = ?
       ORDER BY assigned_at DESC
       LIMIT ?`
    ).all(goalId, Math.min(limit, 100)) as GoalAgentAssignmentRow[];

    return rows.map(rowToAssignment);
  }

  listByAgent(agentId: string, limit = 20): GoalAgentAssignment[] {
    const rows = this.db.prepare(
      `SELECT * FROM goal_agent_assignments
       WHERE agent_id = ?
       ORDER BY assigned_at DESC
       LIMIT ?`
    ).all(agentId, Math.min(limit, 100)) as GoalAgentAssignmentRow[];

    return rows.map(rowToAssignment);
  }

  listGoalHistoryByAgent(agentId: string, limit = 20): Array<GoalAgentAssignment & {
    goalTitle: string;
    status: string;
    currentStage: string;
    lastEvent: string;
    firstSeenAt: string;
    lastSeenAt: string;
  }> {
    const rows = this.db.prepare(
      `SELECT
         a.*,
         g.title AS goal_title,
         g.status,
         g.current_stage,
         COALESCE(a.released_at, a.assigned_at) AS last_seen_at
       FROM goal_agent_assignments a
       INNER JOIN goals g ON g.id = a.goal_id
       WHERE a.agent_id = ?
       ORDER BY last_seen_at DESC
       LIMIT ?`
    ).all(agentId, Math.min(limit, 100)) as Array<GoalAgentAssignmentRow & {
      goal_title: string;
      status: string;
      current_stage: string;
      last_seen_at: string;
    }>;

    return rows.map((row) => ({
      ...rowToAssignment(row),
      goalTitle: row.goal_title,
      status: row.status,
      currentStage: row.current_stage,
      lastEvent: row.assignment_reason,
      firstSeenAt: row.assigned_at,
      lastSeenAt: row.last_seen_at,
    }));
  }

  closeOpenForGoal(goalId: string, releasedAt: string): void {
    this.db.prepare(
      `UPDATE goal_agent_assignments
       SET released_at = ?
       WHERE goal_id = ? AND released_at IS NULL`
    ).run(releasedAt, goalId);
  }
}
