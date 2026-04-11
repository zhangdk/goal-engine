import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb } from './helpers.js';
import { createApp } from '../src/app.js';

let app: ReturnType<typeof createApp>;
let goalId: string;

beforeEach(async () => {
  const db = makeTestDb();
  app = createApp(db);

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

  // 创建 failure attempt + reflection → 生成 policy
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
  const attemptId = ((await attemptRes.json()) as { data: { id: string } }).data.id;

  await app.request('/api/v1/reflections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      goal_id: goalId,
      attempt_id: attemptId,
      summary: '搜索未找到答案',
      root_cause: '搜索词太泛',
      must_change: '切换到官方文档',
      avoid_strategy: 'broad-web-search',
    }),
  });
});

describe('POST /api/v1/retry-guard/check', () => {
  it('returns 200 even when blocked (not 4xx)', async () => {
    const res = await app.request('/api/v1/retry-guard/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: goalId,
        planned_action: '再次搜索',
        what_changed: '',
        strategy_tags: ['broad-web-search'],  // 在 avoid_strategies 中
        policy_acknowledged: true,
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { data: { allowed: boolean; reason: string } };
    expect(body.data.allowed).toBe(false);
    expect(body.data.reason).toBe('blocked_strategy_overlap');
  });

  it('returns allowed=true when strategy changed', async () => {
    const res = await app.request('/api/v1/retry-guard/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: goalId,
        planned_action: '切换到官方文档',
        what_changed: '切换到官方文档策略',
        strategy_tags: ['official-docs'],
        policy_acknowledged: true,
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { data: { allowed: boolean } };
    expect(body.data.allowed).toBe(true);
  });

  it('persists retry-check history for later timeline evidence', async () => {
    const res = await app.request('/api/v1/retry-guard/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: goalId,
        planned_action: '再次搜索',
        what_changed: '',
        strategy_tags: ['broad-web-search'],
        policy_acknowledged: true,
      }),
    });

    expect(res.status).toBe(200);

    const detailRes = await app.request('/api/v1/ui/agents/goal-engine-demo');
    expect(detailRes.status).toBe(200);
    const detailBody = await detailRes.json() as {
      data: {
        timeline: Array<{
          type: string;
          summary: string;
          impact: string;
        }>;
        system_gaps: Array<{
          key: string;
          status: string;
        }>;
      };
    };

    expect(detailBody.data.timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'retry_check',
          summary: '再次搜索',
          impact: expect.stringContaining('blocked_strategy_overlap'),
        }),
      ])
    );
    expect(detailBody.data.system_gaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'retry_history',
          status: 'covered',
        }),
      ])
    );
  });

  it('returns 422 when goal_id is missing', async () => {
    const res = await app.request('/api/v1/retry-guard/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        planned_action: '搜索',
        what_changed: '',
        strategy_tags: [],
        policy_acknowledged: true,
      }),
    });

    expect(res.status).toBe(422);
  });

  it('returns 404 when goal does not exist', async () => {
    const res = await app.request('/api/v1/retry-guard/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: 'missing-goal',
        planned_action: '搜索',
        what_changed: '换了方向',
        strategy_tags: ['official-docs'],
        policy_acknowledged: true,
      }),
    });

    expect(res.status).toBe(404);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('not_found');
  });

  it('returns 404 no_policy_yet when goal exists but no policy is available', async () => {
    const db = makeTestDb();
    const localApp = createApp(db);

    const goalRes = await localApp.request('/api/v1/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '无 policy 目标',
        success_criteria: ['完成目标'],
        stop_conditions: [],
        current_stage: 'research',
      }),
    });
    const localGoalId = ((await goalRes.json()) as { data: { id: string } }).data.id;

    const res = await localApp.request('/api/v1/retry-guard/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: localGoalId,
        planned_action: '搜索',
        what_changed: '换了方向',
        strategy_tags: ['official-docs'],
        policy_acknowledged: true,
      }),
    });

    expect(res.status).toBe(404);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('no_policy_yet');
  });
});
