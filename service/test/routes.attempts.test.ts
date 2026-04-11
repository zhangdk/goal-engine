import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb } from './helpers.js';
import { createApp } from '../src/app.js';

let app: ReturnType<typeof createApp>;
let goalId: string;

beforeEach(async () => {
  const db = makeTestDb();
  app = createApp(db);

  // 创建 active goal
  const res = await app.request('/api/v1/goals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: '目标',
      success_criteria: ['完成目标'],
      stop_conditions: [],
      current_stage: 'research',
    }),
  });
  const body = await res.json() as { data: { id: string } };
  goalId = body.data.id;
});

describe('POST /api/v1/attempts', () => {
  it('creates a success attempt', async () => {
    const res = await app.request('/api/v1/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: goalId,
        stage: 'research',
        action_taken: '完成了搜索',
        strategy_tags: ['official-docs'],
        result: 'success',
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json() as { data: { id: string; result: string } };
    expect(body.data.result).toBe('success');
  });

  it('rejects failure attempt without failure_type', async () => {
    const res = await app.request('/api/v1/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: goalId,
        stage: 'research',
        action_taken: '搜索失败',
        strategy_tags: ['broad-web-search'],
        result: 'failure',
        // failure_type intentionally missing
      }),
    });

    expect(res.status).toBe(422);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('validation_error');
  });

  it('rejects invalid failure_type value', async () => {
    const res = await app.request('/api/v1/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: goalId,
        stage: 'research',
        action_taken: '搜索',
        strategy_tags: [],
        result: 'failure',
        failure_type: 'invalid_type_not_in_enum',
      }),
    });

    expect(res.status).toBe(422);
  });

  it('accepts tool_unavailable as an alias for external_blocker', async () => {
    const res = await app.request('/api/v1/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: goalId,
        stage: 'research',
        action_taken: '搜索工具不可用',
        strategy_tags: ['web'],
        result: 'failure',
        failure_type: 'tool_unavailable',
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json() as { data: { failure_type: string } };
    expect(body.data.failure_type).toBe('external_blocker');
  });

  it('strategy_tags must be an array', async () => {
    const res = await app.request('/api/v1/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: goalId,
        stage: 'research',
        action_taken: '搜索',
        strategy_tags: 'not-an-array',
        result: 'success',
      }),
    });

    expect(res.status).toBe(422);
  });

  it('returns 404 not_found when goal_id does not exist', async () => {
    const res = await app.request('/api/v1/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: 'missing-goal',
        stage: 'research',
        action_taken: '搜索',
        strategy_tags: ['official-docs'],
        result: 'success',
      }),
    });

    expect(res.status).toBe(404);
    const body = await res.json() as { error: { code: string; message: string } };
    expect(body.error.code).toBe('not_found');
    expect(body.error.message).toBe('Goal not found');
  });
});

describe('GET /api/v1/attempts', () => {
  it('lists attempts for a goal', async () => {
    await app.request('/api/v1/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: goalId,
        stage: 'research',
        action_taken: '搜索',
        strategy_tags: ['broad-web-search'],
        result: 'failure',
        failure_type: 'tool_error',
      }),
    });

    const res = await app.request(`/api/v1/attempts?goal_id=${goalId}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { data: unknown[] };
    expect(body.data).toHaveLength(1);
  });

  it('does not list another agent attempt history for the same goal id', async () => {
    const db = makeTestDb();
    const localApp = createApp(db);

    const goalRes = await localApp.request('/api/v1/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Agent-Id': 'agent-a' },
      body: JSON.stringify({
        title: 'Agent A Goal',
        success_criteria: ['A succeeds'],
        stop_conditions: [],
        current_stage: 'research',
      }),
    });
    const agentAGoalId = ((await goalRes.json()) as { data: { id: string } }).data.id;

    await localApp.request('/api/v1/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Agent-Id': 'agent-a' },
      body: JSON.stringify({
        goal_id: agentAGoalId,
        stage: 'research',
        action_taken: 'Agent A private attempt',
        strategy_tags: ['private-path'],
        result: 'failure',
        failure_type: 'tool_error',
      }),
    });

    const res = await localApp.request(`/api/v1/attempts?goal_id=${agentAGoalId}`, {
      headers: { 'X-Agent-Id': 'agent-b' },
    });

    expect(res.status).toBe(404);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('not_found');
  });
});
