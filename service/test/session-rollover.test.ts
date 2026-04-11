import { describe, it, expect, beforeEach, vi } from 'vitest';
import { makeTestDb } from './helpers.js';
import { GoalRepo } from '../src/repos/goal.repo.js';
import { GoalAgentAssignmentRepo } from '../src/repos/goal-agent-assignment.repo.js';
import { GoalAgentHistoryService } from '../src/services/goal-agent-history.service.js';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let db: ReturnType<typeof makeTestDb>;
let goalRepo: GoalRepo;
let assignmentRepo: GoalAgentAssignmentRepo;

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

function createGoal(): string {
  const id = randomUUID();
  const now = new Date().toISOString();
  goalRepo.create({
    id,
    title: '测试目标',
    status: 'active',
    successCriteria: ['条件A'],
    stopConditions: [],
    priority: 1,
    currentStage: 'research',
    createdAt: now,
    updatedAt: now,
  });
  return id;
}

beforeEach(() => {
  db = makeTestDb();
  goalRepo = new GoalRepo(db);
  assignmentRepo = new GoalAgentAssignmentRepo(db);
});

describe('session rollover continuity', () => {
  it('uses session_rollover when same agent switches to new session', () => {
    const goalId = createGoal();

    // First session: agent-1 starts the goal
    const ws1 = makeWorkspaceState([
      { agentId: 'agent-1', agentName: 'Alpha', workspace: 'ws', session: 'sess-1', managed: true },
    ]);
    const rt1 = makeRuntimeState({ agentId: 'agent-1', agentName: 'Alpha', workspace: 'ws', session: 'sess-1' });
    const svc1 = new GoalAgentHistoryService(goalRepo, assignmentRepo, {
      workspaceStatePath: ws1,
      runtimeStatePath: rt1,
    });
    svc1.recordGoalStart(goalId, '2026-04-06T10:00:00.000Z');

    const firstAssignment = assignmentRepo.getOpenByGoal(goalId);
    expect(firstAssignment).not.toBeNull();
    expect(firstAssignment!.agentId).toBe('agent-1');
    expect(firstAssignment!.session).toBe('sess-1');
    expect(firstAssignment!.assignmentReason).toBe('goal_started');

    // Second session: same agent, different session
    const ws2 = makeWorkspaceState([
      { agentId: 'agent-1', agentName: 'Alpha', workspace: 'ws', session: 'sess-2', managed: true },
    ]);
    const rt2 = makeRuntimeState({ agentId: 'agent-1', agentName: 'Alpha', workspace: 'ws', session: 'sess-2' });
    const svc2 = new GoalAgentHistoryService(goalRepo, assignmentRepo, {
      workspaceStatePath: ws2,
      runtimeStatePath: rt2,
    });
    svc2.touchGoal(goalId, 'recovery', '2026-04-06T11:00:00.000Z');

    // The old assignment should be closed
    const allAssignments = assignmentRepo.listByGoal(goalId);
    expect(allAssignments.length).toBe(2);

    const closedAssignment = allAssignments.find((a) => a.releasedAt !== undefined);
    expect(closedAssignment).toBeDefined();
    expect(closedAssignment!.session).toBe('sess-1');

    const currentAssignment = assignmentRepo.getOpenByGoal(goalId);
    expect(currentAssignment).not.toBeNull();
    expect(currentAssignment!.agentId).toBe('agent-1');
    expect(currentAssignment!.session).toBe('sess-2');
    expect(currentAssignment!.assignmentReason).toBe('session_rollover');
  });

  it('uses runtime_switch when different agent takes over', () => {
    const goalId = createGoal();

    // Agent 1 starts
    const ws1 = makeWorkspaceState([
      { agentId: 'agent-1', agentName: 'Alpha', workspace: 'ws', session: 'sess-1', managed: true },
    ]);
    const rt1 = makeRuntimeState({ agentId: 'agent-1', agentName: 'Alpha', workspace: 'ws', session: 'sess-1' });
    const svc1 = new GoalAgentHistoryService(goalRepo, assignmentRepo, {
      workspaceStatePath: ws1,
      runtimeStatePath: rt1,
    });
    svc1.recordGoalStart(goalId, '2026-04-06T10:00:00.000Z');

    // Agent 2 takes over
    const ws2 = makeWorkspaceState([
      { agentId: 'agent-2', agentName: 'Beta', workspace: 'ws', session: 'sess-2', managed: true },
    ]);
    const rt2 = makeRuntimeState({ agentId: 'agent-2', agentName: 'Beta', workspace: 'ws', session: 'sess-2' });
    const svc2 = new GoalAgentHistoryService(goalRepo, assignmentRepo, {
      workspaceStatePath: ws2,
      runtimeStatePath: rt2,
    });
    svc2.touchGoal(goalId, 'recovery', '2026-04-06T11:00:00.000Z');

    const currentAssignment = assignmentRepo.getOpenByGoal(goalId);
    expect(currentAssignment).not.toBeNull();
    expect(currentAssignment!.agentId).toBe('agent-2');
    expect(currentAssignment!.assignmentReason).toBe('runtime_switch');
  });
});
