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

  it('returns descriptive knowledge when a reflection is created', async () => {
    const res = await app.request('/api/v1/reflections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: goalId,
        attempt_id: failAttemptId,
        summary: 'The aggregator page timed out.',
        root_cause: 'The site is unreliable in automation.',
        must_change: 'Use official event pages first.',
        avoid_strategy: 'event_search',
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json() as {
      data: {
        knowledge: {
          context: string;
          observation: string;
          hypothesis: string;
          implication: string;
          related_strategy_tags: string[];
        };
      };
    };

    expect(body.data.knowledge.observation).toBe('The aggregator page timed out.');
    expect(body.data.knowledge.hypothesis).toBe('The site is unreliable in automation.');
    expect(body.data.knowledge.implication).toBe('Use official event pages first.');
    expect(body.data.knowledge.related_strategy_tags).toContain('broad-web-search');
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

  it('does not create a reflection for another agent attempt', async () => {
    const db = makeTestDb();
    const localApp = createApp(db);

    const goalRes = await localApp.request('/api/v1/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Agent-Id': 'agent-a' },
      body: JSON.stringify({
        title: 'Agent A Goal',
        success_criteria: ['A succeeds'],
        current_stage: 'research',
      }),
    });
    const agentAGoalId = ((await goalRes.json()) as { data: { id: string } }).data.id;

    const attemptRes = await localApp.request('/api/v1/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Agent-Id': 'agent-a' },
      body: JSON.stringify({
        goal_id: agentAGoalId,
        stage: 'research',
        action_taken: 'Agent A failed privately',
        strategy_tags: ['private-path'],
        result: 'failure',
        failure_type: 'tool_error',
      }),
    });
    const agentAAttemptId = ((await attemptRes.json()) as { data: { id: string } }).data.id;

    const res = await localApp.request('/api/v1/reflections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Agent-Id': 'agent-b' },
      body: JSON.stringify({
        goal_id: agentAGoalId,
        attempt_id: agentAAttemptId,
        summary: 'Should not be allowed',
        root_cause: 'Cross-agent read',
        must_change: 'Reject cross-agent writes',
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

  it('does not return another agent policy for the same goal id', async () => {
    const db = makeTestDb();
    const localApp = createApp(db);

    const goalRes = await localApp.request('/api/v1/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Agent-Id': 'agent-a' },
      body: JSON.stringify({
        title: 'Agent A Goal',
        success_criteria: ['A succeeds'],
        current_stage: 'research',
      }),
    });
    const agentAGoalId = ((await goalRes.json()) as { data: { id: string } }).data.id;

    const attemptRes = await localApp.request('/api/v1/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Agent-Id': 'agent-a' },
      body: JSON.stringify({
        goal_id: agentAGoalId,
        stage: 'research',
        action_taken: 'Agent A failed privately',
        strategy_tags: ['private-path'],
        result: 'failure',
        failure_type: 'tool_error',
      }),
    });
    const agentAAttemptId = ((await attemptRes.json()) as { data: { id: string } }).data.id;

    await localApp.request('/api/v1/reflections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Agent-Id': 'agent-a' },
      body: JSON.stringify({
        goal_id: agentAGoalId,
        attempt_id: agentAAttemptId,
        summary: '摘要',
        root_cause: '原因',
        must_change: '改变',
        avoid_strategy: 'broad-web-search',
      }),
    });

    const res = await localApp.request(`/api/v1/policies/current?goal_id=${agentAGoalId}`, {
      headers: { 'X-Agent-Id': 'agent-b' },
    });

    expect(res.status).toBe(404);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('not_found');
  });
});
