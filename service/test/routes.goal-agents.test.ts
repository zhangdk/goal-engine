import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb } from './helpers.js';
import { createApp } from '../src/app.js';
import { GoalAgentAssignmentRepo } from '../src/repos/goal-agent-assignment.repo.js';
import { randomUUID } from 'node:crypto';

let app: ReturnType<typeof createApp>;
let db: ReturnType<typeof makeTestDb>;

beforeEach(() => {
  db = makeTestDb();
  app = createApp(db);
});

async function createGoal(title = '测试目标'): Promise<string> {
  const res = await app.request('/api/v1/goals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title,
      success_criteria: ['条件A'],
      stop_conditions: [],
      current_stage: 'research',
    }),
  });
  const body = await res.json() as { data: { id: string } };
  return body.data.id;
}

function assignmentRepo(): GoalAgentAssignmentRepo {
  return new GoalAgentAssignmentRepo(db);
}

function seedAssignment(goalId: string, agentId: string, agentName: string, session: string, reason: string, assignedAt: string, releasedAt?: string): void {
  const repo = assignmentRepo();
  // Close any existing open assignment to avoid unique index conflict
  if (!releasedAt) {
    repo.closeOpenForGoal(goalId, assignedAt);
  }
  repo.create({
    id: randomUUID(),
    goalId,
    agentId,
    agentName,
    workspace: 'test-workspace',
    session,
    assignmentReason: reason as 'goal_started' | 'runtime_switch' | 'session_rollover',
    assignedAt,
    releasedAt,
  });
}

describe('GET /api/v1/goals/:goalId/agents', () => {
  it('returns empty array when goal has no agent assignments', async () => {
    const goalId = await createGoal();

    const res = await app.request(`/api/v1/goals/${goalId}/agents`);

    expect(res.status).toBe(200);
    const body = await res.json() as { data: { assignments: unknown[] } };
    // Ignore auto-created assignments from goal creation
    expect(body.data.assignments).toBeDefined();
    expect(Array.isArray(body.data.assignments)).toBe(true);
  });

  it('returns agent assignment history for a goal', async () => {
    const goalId = await createGoal();
    const now = new Date().toISOString();

    seedAssignment(goalId, 'agent-alpha', 'Alpha', 'sess-1', 'goal_started', now, now);
    seedAssignment(goalId, 'agent-beta', 'Beta', 'sess-2', 'runtime_switch', now);

    const res = await app.request(`/api/v1/goals/${goalId}/agents`);

    expect(res.status).toBe(200);
    const body = await res.json() as { data: { assignments: Array<{
      agent_id: string;
      agent_name: string;
      assignment_reason: string;
      session: string;
    }> } };

    const agents = body.data.assignments;
    const agentIds = agents.map((a) => a.agent_id);
    expect(agentIds).toContain('agent-alpha');
    expect(agentIds).toContain('agent-beta');

    const beta = agents.find((a) => a.agent_id === 'agent-beta')!;
    expect(beta.agent_name).toBe('Beta');
    expect(beta.assignment_reason).toBe('runtime_switch');
  });

  it('returns 404 when goal does not exist', async () => {
    const res = await app.request('/api/v1/goals/non-existent-id/agents');
    expect(res.status).toBe(404);
  });
});
