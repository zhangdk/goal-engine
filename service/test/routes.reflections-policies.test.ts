import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb } from './helpers.js';
import { createApp } from '../src/app.js';

let app: ReturnType<typeof createApp>;
let goalId: string;
let failAttemptId: string;

beforeEach(async () => {
  const db = makeTestDb();
  app = createApp(db);

  // 创建 active goal
  const goalRes = await app.request('/api/v1/goals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: '目标',
      success_criteria: ['完成目标'],
      stop_conditions: [],
      current_stage: 'research',
    }),
  });
  goalId = ((await goalRes.json()) as { data: { id: string } }).data.id;

  // 创建 failure attempt
  const attemptRes = await app.request('/api/v1/attempts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      goal_id: goalId,
      stage: 'research',
      action_taken: '搜索失败',
      strategy_tags: ['broad-web-search'],
      result: 'failure',
      failure_type: 'tool_error',
    }),
  });
  failAttemptId = ((await attemptRes.json()) as { data: { id: string } }).data.id;
});

describe('POST /api/v1/reflections', () => {
  it('writes reflection and returns updated policy in same response', async () => {
    const res = await app.request('/api/v1/reflections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: goalId,
        attempt_id: failAttemptId,
        summary: '搜索未找到答案',
        root_cause: '搜索词太泛',
        must_change: '切换到官方文档',
        avoid_strategy: 'broad-web-search',
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json() as {
      data: {
        reflection: { id: string };
        policy: { avoid_strategies: string[]; preferred_next_step: string };
      };
    };
    expect(body.data.reflection.id).toBeDefined();
    expect(body.data.policy.avoid_strategies).toContain('broad-web-search');
    expect(body.data.policy.preferred_next_step).toBe('切换到官方文档');
  });

  it('returns 409 when duplicate reflection for same attempt', async () => {
    await app.request('/api/v1/reflections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: goalId,
        attempt_id: failAttemptId,
        summary: '第一次',
        root_cause: '原因',
        must_change: '改变',
      }),
    });

    const res = await app.request('/api/v1/reflections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: goalId,
        attempt_id: failAttemptId,
        summary: '第二次',
        root_cause: '原因',
        must_change: '改变',
      }),
    });

    expect(res.status).toBe(409);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('duplicate_reflection');
  });

  it('returns 404 when attempt does not exist', async () => {
    const res = await app.request('/api/v1/reflections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: goalId,
        attempt_id: 'nonexistent-attempt',
        summary: '摘要',
        root_cause: '原因',
        must_change: '改变',
      }),
    });

    expect(res.status).toBe(404);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('not_found');
  });

  it('returns 422 when attempt goal does not match', async () => {
    // Create a second goal (need to complete first one)
    await app.request(`/api/v1/goals/${goalId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    });
    const goal2Res = await app.request('/api/v1/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '目标2',
        success_criteria: ['条件'],
        current_stage: 'init',
      }),
    });
    const goal2Id = ((await goal2Res.json()) as { data: { id: string } }).data.id;

    const res = await app.request('/api/v1/reflections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: goal2Id,
        attempt_id: failAttemptId,
        summary: '摘要',
        root_cause: '原因',
        must_change: '改变',
      }),
    });

    expect(res.status).toBe(422);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('validation_error');
  });

  it('returns 422 when attempt is not a failure', async () => {
    // Create a success attempt
    const successRes = await app.request('/api/v1/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: goalId,
        stage: 'research',
        action_taken: '成功',
        strategy_tags: ['good-strategy'],
        result: 'success',
      }),
    });
    const successAttemptId = ((await successRes.json()) as { data: { id: string } }).data.id;

    const res = await app.request('/api/v1/reflections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: goalId,
        attempt_id: successAttemptId,
        summary: '摘要',
        root_cause: '原因',
        must_change: '改变',
      }),
    });

    expect(res.status).toBe(422);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('validation_error');
  });

  it('returns 422 when required fields missing', async () => {
    const res = await app.request('/api/v1/reflections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal_id: goalId }),
    });

    expect(res.status).toBe(422);
  });
});

describe('GET /api/v1/policies/current', () => {
  it('returns 404 when no policy exists', async () => {
    const res = await app.request(`/api/v1/policies/current?goal_id=${goalId}`);
    expect(res.status).toBe(404);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('no_policy_yet');
  });

  it('returns 200 with current policy after reflection', async () => {
    await app.request('/api/v1/reflections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: goalId,
        attempt_id: failAttemptId,
        summary: '摘要',
        root_cause: '原因',
        must_change: '改变',
        avoid_strategy: 'broad-web-search',
      }),
    });

    const res = await app.request(`/api/v1/policies/current?goal_id=${goalId}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { data: { avoid_strategies: string[] } };
    expect(body.data.avoid_strategies).toContain('broad-web-search');
  });
});
