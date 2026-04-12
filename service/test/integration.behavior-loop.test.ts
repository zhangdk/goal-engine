/**
 * 行为闭环集成测试
 *
 * 验证完整端到端闭环：
 *
 *   create goal
 *       │
 *       ▼
 *   append failure attempt  [strategy: broad-web-search]
 *       │
 *       ▼
 *   submit reflection       [avoid: broad-web-search]
 *       │
 *       ▼
 *   policy updated          [avoid_strategies: ['broad-web-search']]
 *       │
 *       ▼
 *   retry same strategy     → BLOCKED (no_meaningful_change) + advisory
 *       │
 *       ▼
 *   retry with new strategy → ALLOWED (allowed)
 *       │
 *       ▼
 *   get recovery packet     → success
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb } from './helpers.js';
import { createApp } from '../src/app.js';

let app: ReturnType<typeof createApp>;

beforeEach(() => {
  const db = makeTestDb();
  app = createApp(db);
});

describe('Behavior Change Loop — full end-to-end', () => {
  it('enforces the complete attempt → reflection → policy → retry_guard → recovery_packet loop', async () => {

    // ── Step 1: 创建 goal ──────────────────────────────────────────────────────
    const goalRes = await app.request('/api/v1/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '找出 API 限流问题的根因',
        success_criteria: ['定位到根因', '提出解决方案'],
        stop_conditions: ['超过 10 次失败'],
        current_stage: 'investigation',
      }),
    });
    expect(goalRes.status).toBe(201);
    const { data: goal } = await goalRes.json() as { data: { id: string; status: string } };
    expect(goal.status).toBe('active');

    // ── Step 2: 记录失败 attempt ────────────────────────────────────────────────
    const attemptRes = await app.request('/api/v1/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: goal.id,
        stage: 'investigation',
        action_taken: '使用宽泛关键词搜索网络，未找到具体答案',
        strategy_tags: ['broad-web-search'],
        result: 'failure',
        failure_type: 'tool_error',
      }),
    });
    expect(attemptRes.status).toBe(201);
    const { data: attempt } = await attemptRes.json() as { data: { id: string } };

    // ── Step 3: 提交 reflection（必须同步更新 policy）────────────────────────────
    const reflectionRes = await app.request('/api/v1/reflections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: goal.id,
        attempt_id: attempt.id,
        summary: '宽泛搜索无法定位到具体的 API 限流文档',
        root_cause: '搜索范围太广，信噪比太低',
        must_change: '切换到官方 API 文档，narrowed-scope 策略',
        avoid_strategy: 'broad-web-search',
      }),
    });
    expect(reflectionRes.status).toBe(201);
    const { data: reflResult } = await reflectionRes.json() as {
      data: {
        reflection: { id: string };
        policy: { avoid_strategies: string[]; preferred_next_step: string };
      };
    };
    // policy 在同一响应中同步返回
    expect(reflResult.policy.avoid_strategies).toContain('broad-web-search');
    expect(reflResult.policy.preferred_next_step).toBeTruthy();

    // ── Step 4: 读取当前 policy ───────────────────────────────────────────────
    const policyRes = await app.request(`/api/v1/policies/current?goal_id=${goal.id}`);
    expect(policyRes.status).toBe(200);
    const { data: policy } = await policyRes.json() as {
      data: { avoid_strategies: string[] };
    };
    expect(policy.avoid_strategies).toContain('broad-web-search');

    // ── Step 5: 用相同策略重试 → 应被阻断 ────────────────────────────────────
    const blockedRes = await app.request('/api/v1/retry-guard/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: goal.id,
        planned_action: '再次使用宽泛搜索',
        what_changed: '',
        strategy_tags: ['broad-web-search'],
        policy_acknowledged: true,
      }),
    });
    expect(blockedRes.status).toBe(200);
    const { data: blocked } = await blockedRes.json() as {
      data: { allowed: boolean; reason: string; warnings: string[] };
    };
    expect(blocked.allowed).toBe(false);
    expect(blocked.reason).toBe('no_meaningful_change');
    expect(blocked.warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining('avoid_strategy'),
      ]),
    );

    // ── Step 6: 换策略重试 → 应被允许 ────────────────────────────────────────
    const allowedRes = await app.request('/api/v1/retry-guard/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: goal.id,
        planned_action: '查阅官方 API 文档的限流章节',
        what_changed: '切换到官方文档，narrowed-scope 策略',
        strategy_tags: ['official-docs', 'narrowed-scope'],
        policy_acknowledged: true,
      }),
    });
    expect(allowedRes.status).toBe(200);
    const { data: allowed } = await allowedRes.json() as {
      data: { allowed: boolean; reason: string };
    };
    expect(allowed.allowed).toBe(true);
    expect(allowed.reason).toBe('allowed');

    // ── Step 7: 获取 recovery packet ─────────────────────────────────────────
    const recoveryRes = await app.request(`/api/v1/recovery-packet?goal_id=${goal.id}`);
    expect(recoveryRes.status).toBe(200);
    const { data: packet } = await recoveryRes.json() as {
      data: {
        goal_id: string;
        goal_title: string;
        current_stage: string;
        success_criteria: string[];
        avoid_strategies: string[];
        preferred_next_step?: string;
        last_failure_summary?: string;
        generated_at: string;
      };
    };
    expect(packet.goal_id).toBe(goal.id);
    expect(packet.goal_title).toBe('找出 API 限流问题的根因');
    expect(packet.avoid_strategies).toContain('broad-web-search');
    expect(packet.last_failure_summary).toBeDefined();
    expect(packet.generated_at).toBeDefined();
  });

  it('blocks duplicate reflection for same attempt', async () => {
    const goalRes = await app.request('/api/v1/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '目标',
        success_criteria: ['完成目标'],
        stop_conditions: [],
        current_stage: 'init',
      }),
    });
    const goalId = ((await goalRes.json()) as { data: { id: string } }).data.id;

    const attemptRes = await app.request('/api/v1/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: goalId,
        stage: 'init',
        action_taken: '尝试1',
        strategy_tags: [],
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
        summary: '第一次',
        root_cause: '原因',
        must_change: '改变',
      }),
    });

    const dupRes = await app.request('/api/v1/reflections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: goalId,
        attempt_id: attemptId,
        summary: '第二次',
        root_cause: '原因',
        must_change: '改变',
      }),
    });

    expect(dupRes.status).toBe(409);
    const { error } = await dupRes.json() as { error: { code: string } };
    expect(error.code).toBe('duplicate_reflection');
  });

  it('policy idempotently merges repeated avoid_strategy across multiple reflections', async () => {
    const goalRes = await app.request('/api/v1/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '目标', success_criteria: ['完成目标'], stop_conditions: [], current_stage: 'init' }),
    });
    const goalId = ((await goalRes.json()) as { data: { id: string } }).data.id;

    // 两次失败，相同 avoid_strategy
    for (let i = 0; i < 2; i++) {
      const ar = await app.request('/api/v1/attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal_id: goalId,
          stage: 'init',
          action_taken: `尝试${i}`,
          strategy_tags: ['broad-web-search'],
          result: 'failure',
          failure_type: 'tool_error',
        }),
      });
      const attemptId = ((await ar.json()) as { data: { id: string } }).data.id;

      await app.request('/api/v1/reflections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal_id: goalId,
          attempt_id: attemptId,
          summary: `摘要${i}`,
          root_cause: '原因',
          must_change: '改变',
          avoid_strategy: 'broad-web-search',
        }),
      });
    }

    const policyRes = await app.request(`/api/v1/policies/current?goal_id=${goalId}`);
    const { data: policy } = await policyRes.json() as { data: { avoid_strategies: string[] } };
    const count = policy.avoid_strategies.filter((s: string) => s === 'broad-web-search').length;
    expect(count).toBe(1);
  });
});
