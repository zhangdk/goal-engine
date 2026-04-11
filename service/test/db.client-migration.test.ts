import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { applySchema } from '../src/db/client.js';
import { GoalRepo } from '../src/repos/goal.repo.js';
import { GoalAgentAssignmentRepo } from '../src/repos/goal-agent-assignment.repo.js';
import { GoalAgentHistoryService } from '../src/services/goal-agent-history.service.js';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DEFAULT_AGENT_ID } from '../src/agent-context.js';

function makeWorkspaceState(agents: Array<{ agentId: string; agentName: string; workspace: string; session: string; managed: boolean }>): string {
  const dir = mkdtempSync(join(tmpdir(), 'ge-test-'));
  const path = join(dir, 'workspace-state.json');
  writeFileSync(path, JSON.stringify({
    goalEngine: {
      currentManagedAgentId: agents.find((a) => a.managed)?.agentId,
      managedAgents: agents,
    },
  }));
  return path;
}

function makeRuntimeState(agent: { agentId: string; agentName: string; workspace: string; session: string }): string {
  const dir = mkdtempSync(join(tmpdir(), 'ge-test-'));
  const path = join(dir, 'runtime-state.json');
  writeFileSync(path, JSON.stringify({
    goalEngine: {
      currentManagedAgentId: agent.agentId,
      managedAgents: [{ ...agent, managed: true }],
    },
  }));
  return path;
}

describe('db schema migration', () => {
  it('backfills legacy goal data to the default agent and permits per-agent active goals', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(`
CREATE TABLE goals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  success_criteria TEXT NOT NULL,
  stop_conditions TEXT NOT NULL,
  priority INTEGER NOT NULL,
  current_stage TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_goals_single_active
  ON goals(status)
  WHERE status = 'active';
INSERT INTO goals (
  id,
  title,
  status,
  success_criteria,
  stop_conditions,
  priority,
  current_stage,
  created_at,
  updated_at
)
VALUES (
  'legacy-active-goal',
  'Legacy active goal',
  'active',
  '["legacy succeeds"]',
  '[]',
  1,
  'legacy',
  '2026-04-10T06:00:00.000Z',
  '2026-04-10T06:00:00.000Z'
);
`);

    applySchema(db);

    const legacyRow = db.prepare(
      `SELECT agent_id FROM goals WHERE id = ?`
    ).get('legacy-active-goal') as { agent_id: string };
    expect(legacyRow.agent_id).toBe(DEFAULT_AGENT_ID);

    const goalRepo = new GoalRepo(db);
    expect(goalRepo.getCurrent(DEFAULT_AGENT_ID)?.id).toBe('legacy-active-goal');

    const otherGoalId = randomUUID();
    expect(() => goalRepo.create({
      id: otherGoalId,
      agentId: 'agent-b',
      title: 'Agent B active goal',
      status: 'active',
      successCriteria: ['B succeeds'],
      stopConditions: [],
      priority: 1,
      currentStage: 'initial',
      createdAt: '2026-04-10T06:01:00.000Z',
      updatedAt: '2026-04-10T06:01:00.000Z',
    })).not.toThrow();
    expect(goalRepo.getCurrent('agent-b')?.id).toBe(otherGoalId);
  });

  it('upgrades goal_agent_assignments constraint to allow session_rollover', () => {
    const db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    db.exec(`
CREATE TABLE goals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  success_criteria TEXT NOT NULL,
  stop_conditions TEXT NOT NULL,
  priority INTEGER NOT NULL,
  current_stage TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE goal_agent_assignments (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES goals(id),
  agent_id TEXT NOT NULL,
  agent_name TEXT NOT NULL,
  workspace TEXT NOT NULL,
  session TEXT NOT NULL,
  assignment_reason TEXT NOT NULL CHECK(assignment_reason IN ('goal_started', 'runtime_switch')),
  assigned_at TEXT NOT NULL,
  released_at TEXT
);
CREATE INDEX idx_goal_agent_assignments_goal_id_assigned_at
  ON goal_agent_assignments(goal_id, assigned_at DESC);
CREATE INDEX idx_goal_agent_assignments_agent_id_assigned_at
  ON goal_agent_assignments(agent_id, assigned_at DESC);
CREATE UNIQUE INDEX idx_goal_agent_assignments_one_open_per_goal
  ON goal_agent_assignments(goal_id)
  WHERE released_at IS NULL;
`);

    applySchema(db);

    const schemaRow = db.prepare(
      `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'goal_agent_assignments'`
    ).get() as { sql: string };
    expect(schemaRow.sql).toContain(`'session_rollover'`);

    const goalRepo = new GoalRepo(db);
    const assignmentRepo = new GoalAgentAssignmentRepo(db);
    const goalId = randomUUID();
    goalRepo.create({
      id: goalId,
      title: '测试目标',
      status: 'active',
      successCriteria: ['条件A'],
      stopConditions: [],
      priority: 1,
      currentStage: 'initial',
      createdAt: '2026-04-10T06:00:00.000Z',
      updatedAt: '2026-04-10T06:00:00.000Z',
    });

    const ws1 = makeWorkspaceState([
      { agentId: 'agent-1', agentName: 'Alpha', workspace: 'ws', session: 'sess-1', managed: true },
    ]);
    const rt1 = makeRuntimeState({ agentId: 'agent-1', agentName: 'Alpha', workspace: 'ws', session: 'sess-1' });
    const svc1 = new GoalAgentHistoryService(goalRepo, assignmentRepo, {
      workspaceStatePath: ws1,
      runtimeStatePath: rt1,
    });
    svc1.recordGoalStart(goalId, '2026-04-10T06:00:00.000Z');

    const ws2 = makeWorkspaceState([
      { agentId: 'agent-1', agentName: 'Alpha', workspace: 'ws', session: 'sess-2', managed: true },
    ]);
    const rt2 = makeRuntimeState({ agentId: 'agent-1', agentName: 'Alpha', workspace: 'ws', session: 'sess-2' });
    const svc2 = new GoalAgentHistoryService(goalRepo, assignmentRepo, {
      workspaceStatePath: ws2,
      runtimeStatePath: rt2,
    });

    expect(() => svc2.touchGoal(goalId, 'recovery', '2026-04-10T06:01:00.000Z')).not.toThrow();
    expect(assignmentRepo.getOpenByGoal(goalId)?.assignmentReason).toBe('session_rollover');
  });
});
