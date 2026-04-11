import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb } from './helpers.js';
import { createApp } from '../src/app.js';

let app: ReturnType<typeof createApp>;

beforeEach(() => {
  const db = makeTestDb();
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
