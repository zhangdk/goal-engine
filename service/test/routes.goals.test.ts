import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { makeTestDb } from './helpers.js';
import { createApp } from '../src/app.js';
import { GoalRepo } from '../src/repos/goal.repo.js';

let app: ReturnType<typeof createApp>;
let db: Database.Database;
let goalRepo: GoalRepo;

beforeEach(() => {
  db = makeTestDb();
  goalRepo = new GoalRepo(db);
  app = createApp(db);
});

describe('POST /api/v1/goals', () => {
  it('returns 201 with created goal', async () => {
    const res = await app.request('/api/v1/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '测试目标',
        success_criteria: ['条件A'],
        stop_conditions: ['停止X'],
        current_stage: 'research',
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json() as { data: { id: string; status: string } };
    expect(body.data.id).toBeDefined();
    expect(body.data.status).toBe('active');
  });

  it('creates an optional goal contract with the goal', async () => {
    const res = await app.request('/api/v1/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Agent-Id': 'agent-contract' },
      body: JSON.stringify({
        title: 'Goal with contract',
        success_criteria: ['Payment confirmation exists'],
        stop_conditions: ['No deception'],
        current_stage: 'goal-contract',
        contract: {
          outcome: 'Earn 100 RMB',
          success_evidence: ['Payment confirmation exists'],
          deadline_at: '2026-04-18T00:00:00.000Z',
          autonomy_level: 2,
          boundary_rules: ['Ask before payment'],
          stop_conditions: ['No deception'],
          strategy_guidance: ['Prefer fast validation'],
          permission_boundary: ['No payment without approval'],
        },
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json() as {
      data: {
        id: string;
        contract?: {
          goal_id: string;
          outcome: string;
          success_evidence: string[];
          autonomy_level: number;
        };
      };
    };
    expect(body.data.contract).toEqual(expect.objectContaining({
      goal_id: body.data.id,
      outcome: 'Earn 100 RMB',
      success_evidence: ['Payment confirmation exists'],
      autonomy_level: 2,
    }));

    const contractRes = await app.request(`/api/v1/goals/${body.data.id}/contract`, {
      headers: { 'X-Agent-Id': 'agent-contract' },
    });
    expect(contractRes.status).toBe(200);
  });

  it('does not leave an active goal when contract persistence fails', async () => {
    db.prepare(`
      CREATE TRIGGER fail_goal_contract_insert
      BEFORE INSERT ON goal_contracts
      BEGIN
        SELECT RAISE(ABORT, 'contract insert failed');
      END;
    `).run();

    const res = await app.request('/api/v1/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Agent-Id': 'agent-contract' },
      body: JSON.stringify({
        title: 'Goal with failing contract',
        success_criteria: ['Payment confirmation exists'],
        stop_conditions: [],
        current_stage: 'goal-contract',
        contract: {
          outcome: 'Earn 100 RMB',
          success_evidence: ['Payment confirmation exists'],
          autonomy_level: 2,
          boundary_rules: [],
          stop_conditions: [],
          strategy_guidance: [],
          permission_boundary: [],
        },
      }),
    });

    expect(res.status).toBe(500);
    expect(goalRepo.getCurrent('agent-contract')).toBeNull();
  });

  it('returns 409 when active goal already exists', async () => {
    await app.request('/api/v1/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Goal 1',
        success_criteria: ['条件1'],
        stop_conditions: [],
        current_stage: 'init',
      }),
    });

    const res = await app.request('/api/v1/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Goal 2',
        success_criteria: ['条件2'],
        stop_conditions: [],
        current_stage: 'init',
      }),
    });

    expect(res.status).toBe(409);
    const body = await res.json() as {
      error: {
        code: string;
        active_goal?: {
          title: string;
          current_stage: string;
        };
      };
    };
    expect(body.error.code).toBe('state_conflict');
    expect(body.error.active_goal).toEqual(
      expect.objectContaining({
        title: 'Goal 1',
        current_stage: 'init',
      })
    );
  });

  it('allows one active goal per agent', async () => {
    const agentAHeaders = { 'Content-Type': 'application/json', 'X-Agent-Id': 'agent-a' };
    const agentBHeaders = { 'Content-Type': 'application/json', 'X-Agent-Id': 'agent-b' };

    const firstRes = await app.request('/api/v1/goals', {
      method: 'POST',
      headers: agentAHeaders,
      body: JSON.stringify({
        title: 'Agent A Goal',
        success_criteria: ['A succeeds'],
        stop_conditions: [],
        current_stage: 'init',
      }),
    });
    expect(firstRes.status).toBe(201);

    const secondRes = await app.request('/api/v1/goals', {
      method: 'POST',
      headers: agentBHeaders,
      body: JSON.stringify({
        title: 'Agent B Goal',
        success_criteria: ['B succeeds'],
        stop_conditions: [],
        current_stage: 'init',
      }),
    });
    expect(secondRes.status).toBe(201);
  });

  it('replaces the current active goal when replace_active is true', async () => {
    const firstRes = await app.request('/api/v1/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Goal 1',
        success_criteria: ['条件1'],
        stop_conditions: [],
        current_stage: 'init',
      }),
    });
    const firstBody = await firstRes.json() as { data: { id: string } };

    const res = await app.request('/api/v1/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Goal 2',
        success_criteria: ['条件2'],
        stop_conditions: [],
        current_stage: 'research',
        replace_active: true,
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json() as {
      data: {
        id: string;
        title: string;
        status: string;
        replaced_goal?: {
          id: string;
          title: string;
          status: string;
        };
      };
    };
    expect(body.data.title).toBe('Goal 2');
    expect(body.data.status).toBe('active');
    expect(body.data.replaced_goal).toEqual({
      id: firstBody.data.id,
      title: 'Goal 1',
      status: 'abandoned',
    });

    const currentRes = await app.request('/api/v1/goals/current');
    const currentBody = await currentRes.json() as { data: { title: string } };
    expect(currentBody.data.title).toBe('Goal 2');
  });

  it('returns 422 when title is missing', async () => {
    const res = await app.request('/api/v1/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success_criteria: ['条件'] }),
    });

    expect(res.status).toBe(422);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('validation_error');
  });
});

describe('GET /api/v1/goals/current', () => {
  it('returns 422 for invalid X-Agent-Id instead of 500', async () => {
    const res = await app.request('/api/v1/goals/current', {
      headers: { 'X-Agent-Id': '../bad' },
    });

    expect(res.status).toBe(422);
    const body = await res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('validation_error');
    expect(body.error.message).toContain('X-Agent-Id');
  });

  it('returns 404 when no active goal exists', async () => {
    const res = await app.request('/api/v1/goals/current');
    expect(res.status).toBe(404);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('no_active_goal');
  });

  it('returns 200 with current active goal', async () => {
    await app.request('/api/v1/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '当前目标',
        success_criteria: ['条件A'],
        stop_conditions: [],
        current_stage: 'research',
      }),
    });

    const res = await app.request('/api/v1/goals/current');
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { title: string } };
    expect(body.data.title).toBe('当前目标');
  });

  it('returns the current active goal for the requesting agent only', async () => {
    await app.request('/api/v1/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Agent-Id': 'agent-a' },
      body: JSON.stringify({
        title: 'Agent A Current Goal',
        success_criteria: ['A succeeds'],
        stop_conditions: [],
        current_stage: 'research',
      }),
    });

    await app.request('/api/v1/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Agent-Id': 'agent-b' },
      body: JSON.stringify({
        title: 'Agent B Current Goal',
        success_criteria: ['B succeeds'],
        stop_conditions: [],
        current_stage: 'execution',
      }),
    });

    const agentARes = await app.request('/api/v1/goals/current', {
      headers: { 'X-Agent-Id': 'agent-a' },
    });
    const agentBRes = await app.request('/api/v1/goals/current', {
      headers: { 'X-Agent-Id': 'agent-b' },
    });

    expect(agentARes.status).toBe(200);
    expect(agentBRes.status).toBe(200);
    const agentABody = await agentARes.json() as { data: { title: string } };
    const agentBBody = await agentBRes.json() as { data: { title: string } };
    expect(agentABody.data.title).toBe('Agent A Current Goal');
    expect(agentBBody.data.title).toBe('Agent B Current Goal');
  });
});

describe('PATCH /api/v1/goals/:goalId', () => {
  it('updates allowed fields and returns 200', async () => {
    const createRes = await app.request('/api/v1/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '目标',
        success_criteria: ['条件'],
        stop_conditions: [],
        current_stage: 'init',
      }),
    });
    const { data } = await createRes.json() as { data: { id: string } };

    const res = await app.request(`/api/v1/goals/${data.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'blocked', current_stage: 'execution' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { data: { status: string; current_stage: string } };
    expect(body.data.status).toBe('blocked');
    expect(body.data.current_stage).toBe('execution');
  });
});
