/**
 * Agent Adapter 工具测试
 *
 * 验证：
 * - snake_case ↔ camelCase 映射
 * - 错误标准化（404/409/422/500）
 * - allowed=false 保留为业务结果，不抛异常
 * - reflection_generate 作为本地 helper 存在且输出结构正确
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdapterClient } from '../src/client.js';
import { goalGetCurrent } from '../src/tools/goal-get-current.js';
import { attemptAppend } from '../src/tools/attempt-append.js';
import { reflectionGenerate } from '../src/tools/reflection-generate.js';
import { retryGuardCheck } from '../src/tools/retry-guard-check.js';
import { recoveryPacketGet } from '../src/tools/recovery-packet-get.js';
import { policyGetCurrent } from '../src/tools/policy-get-current.js';
import { reflectionCreate } from '../src/tools/reflection-create.js';

// ─── Mock fetch ───────────────────────────────────────────────────────────────

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

const BASE_URL = 'http://localhost:3100';

// ─── AdapterClient ────────────────────────────────────────────────────────────

describe('AdapterClient', () => {
  it('constructs with base url', () => {
    const client = new AdapterClient(BASE_URL);
    expect(client.baseUrl).toBe(BASE_URL);
  });

  it('maps network failure to a stable service_unavailable error', async () => {
    const fetch = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED'));
    const client = new AdapterClient(BASE_URL, fetch as unknown as typeof globalThis.fetch);

    await expect(client.get('/api/v1/health')).rejects.toMatchObject({
      code: 'service_unavailable',
      status: 503,
      message: 'Goal Engine service is unavailable',
    });
  });

  it('maps unknown server errors to a stable fallback message', async () => {
    const fetch = mockFetch(500, { error: { code: 'internal_error' } });
    const client = new AdapterClient(BASE_URL, fetch as unknown as typeof globalThis.fetch);

    await expect(client.get('/api/v1/health')).rejects.toMatchObject({
      code: 'internal_error',
      status: 500,
      message: 'Goal Engine service returned an unexpected error',
    });
  });

  it('sends X-Agent-Id when constructed with an agent id', async () => {
    const fetch = mockFetch(200, { data: { ok: true } });
    const client = new AdapterClient(BASE_URL, fetch as unknown as typeof globalThis.fetch, 'agent-a');

    await client.post('/api/v1/goals', { title: 'Agent scoped goal' });

    const [, init] = fetch.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get('X-Agent-Id')).toBe('agent-a');
  });
});

// ─── goal_get_current ─────────────────────────────────────────────────────────

describe('goalGetCurrent', () => {
  it('maps snake_case response to camelCase', async () => {
    const fetch = mockFetch(200, {
      data: {
        id: 'goal_1',
        title: '测试',
        status: 'active',
        success_criteria: ['条件A'],
        stop_conditions: [],
        priority: 1,
        current_stage: 'research',
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    });

    const client = new AdapterClient(BASE_URL, fetch as unknown as typeof globalThis.fetch);
    const goal = await goalGetCurrent(client);

    expect(goal.id).toBe('goal_1');
    expect(goal.currentStage).toBe('research');
    expect(goal.successCriteria).toEqual(['条件A']);
    expect((goal as Record<string, unknown>)['current_stage']).toBeUndefined();
  });

  it('throws normalized error on 404 no_active_goal', async () => {
    const fetch = mockFetch(404, { error: { code: 'no_active_goal', message: 'No active goal' } });
    const client = new AdapterClient(BASE_URL, fetch as unknown as typeof globalThis.fetch);

    await expect(goalGetCurrent(client)).rejects.toMatchObject({
      code: 'no_active_goal',
      status: 404,
    });
  });
});

// ─── attempt_append ───────────────────────────────────────────────────────────

describe('attemptAppend', () => {
  it('serializes camelCase input to snake_case request body', async () => {
    const fetch = mockFetch(201, {
      data: {
        id: 'attempt_1',
        goal_id: 'goal_1',
        stage: 'research',
        action_taken: '搜索',
        strategy_tags: ['broad-web-search'],
        result: 'failure',
        failure_type: 'tool_error',
        created_at: '2026-01-01T00:00:00.000Z',
      },
    });

    const client = new AdapterClient(BASE_URL, fetch as unknown as typeof globalThis.fetch);
    const result = await attemptAppend(client, {
      goalId: 'goal_1',
      stage: 'research',
      actionTaken: '搜索',
      strategyTags: ['broad-web-search'],
      result: 'failure',
      failureType: 'tool_error',
    });

    // 验证 fetch 被调用时传入了 snake_case body
    const callBody = JSON.parse((fetch.mock.calls[0][1] as RequestInit).body as string);
    expect(callBody.strategy_tags).toEqual(['broad-web-search']);
    expect(callBody.goal_id).toBe('goal_1');
    expect(callBody.action_taken).toBe('搜索');

    // 返回结果是 camelCase
    expect(result.id).toBe('attempt_1');
    expect(result.goalId).toBe('goal_1');
  });
});

// ─── reflection_generate（本地 helper）───────────────────────────────────────

describe('reflectionGenerate', () => {
  it('exists as a local helper without service call', async () => {
    // reflection_generate 不依赖 AdapterClient
    const result = await reflectionGenerate({
      attemptSummary: '搜索未找到答案',
      failureType: 'tool_error',
      strategyTags: ['broad-web-search'],
    });

    expect(result).toHaveProperty('summary');
    expect(result).toHaveProperty('rootCause');
    expect(result).toHaveProperty('mustChange');
    // avoidStrategy 是可选字段
    expect('avoidStrategy' in result).toBe(true);
  });

  it('output structure is compatible with reflection write input', () => {
    // 确认结构字段名正确（camelCase）
    const keys = ['summary', 'rootCause', 'mustChange', 'avoidStrategy'] as const;
    const result = reflectionGenerate({
      attemptSummary: '测试',
      failureType: 'capability_gap',
      strategyTags: [],
    });

    keys.forEach(k => {
      expect(result).toHaveProperty(k);
    });
  });
});

describe('reflectionCreate', () => {
  it('maps optional returned knowledge to camelCase', async () => {
    const fetch = mockFetch(201, {
      data: {
        reflection: {
          id: 'reflection_1',
          goal_id: 'goal_1',
          attempt_id: 'attempt_1',
          summary: 'Timed out',
          root_cause: 'Aggregator unstable',
          must_change: 'Use official pages',
          created_at: '2026-01-01T00:00:00.000Z',
        },
        policy: {
          id: 'policy_1',
          goal_id: 'goal_1',
          preferred_next_step: 'Use official pages',
          avoid_strategies: ['broad-web-search'],
          must_check_before_retry: ['确认不同路径'],
          updated_at: '2026-01-01T00:00:00.000Z',
        },
        knowledge: {
          id: 'know_1',
          goal_id: 'goal_1',
          source_attempt_id: 'attempt_1',
          context: 'Stage: search; action: broad search',
          observation: 'Timed out',
          hypothesis: 'Aggregator unstable',
          implication: 'Use official pages',
          related_strategy_tags: ['broad-web-search'],
          created_at: '2026-01-01T00:00:00.000Z',
        },
      },
    });

    const client = new AdapterClient(BASE_URL, fetch as unknown as typeof globalThis.fetch);
    const result = await reflectionCreate(client, {
      goalId: 'goal_1',
      attemptId: 'attempt_1',
      summary: 'Timed out',
      rootCause: 'Aggregator unstable',
      mustChange: 'Use official pages',
    });

    expect(result.knowledge?.observation).toBe('Timed out');
    expect(result.knowledge?.relatedStrategyTags).toEqual(['broad-web-search']);
  });
});

// ─── retry_guard_check ────────────────────────────────────────────────────────

describe('retryGuardCheck', () => {
  it('preserves allowed=false as business result, does not throw', async () => {
    const fetch = mockFetch(200, {
      data: {
        allowed: false,
        reason: 'blocked_strategy_overlap',
        warnings: [],
        tag_overlap_rate: 1.0,
      },
    });

    const client = new AdapterClient(BASE_URL, fetch as unknown as typeof globalThis.fetch);
    const result = await retryGuardCheck(client, {
      goalId: 'goal_1',
      plannedAction: '再次搜索',
      whatChanged: '',
      strategyTags: ['broad-web-search'],
      policyAcknowledged: true,
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('blocked_strategy_overlap');
  });

  it('serializes camelCase to snake_case request body', async () => {
    const fetch = mockFetch(200, {
      data: { allowed: true, reason: 'allowed', warnings: [] },
    });

    const client = new AdapterClient(BASE_URL, fetch as unknown as typeof globalThis.fetch);
    await retryGuardCheck(client, {
      goalId: 'goal_1',
      plannedAction: '搜索',
      whatChanged: '换了方向',
      strategyTags: ['official-docs'],
      policyAcknowledged: true,
    });

    const callBody = JSON.parse((fetch.mock.calls[0][1] as RequestInit).body as string);
    expect(callBody.goal_id).toBe('goal_1');
    expect(callBody.policy_acknowledged).toBe(true);
    expect(callBody.strategy_tags).toEqual(['official-docs']);
  });
});

// ─── recovery_packet_get ──────────────────────────────────────────────────────

describe('recoveryPacketGet', () => {
  it('maps snake_case generated_at to camelCase generatedAt', async () => {
    const fetch = mockFetch(200, {
      data: {
        goal_id: 'goal_1',
        goal_title: '目标',
        current_stage: 'research',
        success_criteria: ['条件A'],
        avoid_strategies: ['broad-web-search'],
        preferred_next_step: '切换到官方文档',
        current_policy: {
          preferred_next_step: '切换到官方文档',
          must_check_before_retry: ['确认不同路径'],
        },
        recent_attempts: [
          {
            id: 'attempt_1',
            stage: 'research',
            action_taken: '搜索失败',
            result: 'failure',
            failure_type: 'tool_error',
            created_at: '2026-01-01T00:00:00.000Z',
          },
        ],
        relevant_knowledge: [
          {
            id: 'know_1',
            goal_id: 'goal_1',
            context: 'research',
            observation: 'Aggregator was stale.',
            hypothesis: 'Index lag.',
            implication: 'Check official pages.',
            related_strategy_tags: ['broad-web-search'],
            created_at: '2026-01-01T00:00:00.000Z',
          },
        ],
        shared_wisdom: [],
        open_questions: ['Which source is authoritative?'],
        generated_at: '2026-01-01T00:00:00.000Z',
      },
    });

    const client = new AdapterClient(BASE_URL, fetch as unknown as typeof globalThis.fetch);
    const packet = await recoveryPacketGet(client, 'goal_1');

    expect(packet.goalId).toBe('goal_1');
    expect(packet.goalTitle).toBe('目标');
    expect(packet.generatedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(packet.currentPolicy?.mustCheckBeforeRetry).toEqual(['确认不同路径']);
    expect(packet.recentAttempts[0].actionTaken).toBe('搜索失败');
    expect(packet.relevantKnowledge[0].implication).toBe('Check official pages.');
    expect(packet.openQuestions).toEqual(['Which source is authoritative?']);
    expect((packet as Record<string, unknown>)['generated_at']).toBeUndefined();
  });

  it('passes the recovery source through to the service contract when provided', async () => {
    const fetch = mockFetch(200, {
      data: {
        goal_id: 'goal_1',
        goal_title: '目标',
        current_stage: 'research',
        success_criteria: ['条件A'],
        avoid_strategies: [],
        generated_at: '2026-01-01T00:00:00.000Z',
      },
    });

    const client = new AdapterClient(BASE_URL, fetch as unknown as typeof globalThis.fetch);
    await recoveryPacketGet(client, 'goal_1', { source: 'projection' });

    expect(String(fetch.mock.calls[0]?.[0])).toContain('/api/v1/recovery-packet?goal_id=goal_1&source=projection');
  });
});

// ─── policy_get_current ───────────────────────────────────────────────────────

describe('policyGetCurrent', () => {
  it('maps 404 no_policy_yet to stable error object', async () => {
    const fetch = mockFetch(404, { error: { code: 'no_policy_yet', message: 'No policy yet' } });
    const client = new AdapterClient(BASE_URL, fetch as unknown as typeof globalThis.fetch);

    await expect(policyGetCurrent(client, 'goal_1')).rejects.toMatchObject({
      code: 'no_policy_yet',
      status: 404,
    });
  });

  it('maps snake_case policy response to camelCase', async () => {
    const fetch = mockFetch(200, {
      data: {
        id: 'policy_1',
        goal_id: 'goal_1',
        preferred_next_step: '切换到官方文档',
        avoid_strategies: ['broad-web-search'],
        must_check_before_retry: ['确认不同路径'],
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    });

    const client = new AdapterClient(BASE_URL, fetch as unknown as typeof globalThis.fetch);
    const policy = await policyGetCurrent(client, 'goal_1');

    expect(policy.goalId).toBe('goal_1');
    expect(policy.preferredNextStep).toBe('切换到官方文档');
    expect(policy.avoidStrategies).toEqual(['broad-web-search']);
    expect(policy.mustCheckBeforeRetry).toEqual(['确认不同路径']);
  });
});

// ─── 错误归一化 ───────────────────────────────────────────────────────────────

describe('Error normalization', () => {
  it('normalizes 422 validation_error', async () => {
    const fetch = mockFetch(422, { error: { code: 'validation_error', message: 'invalid input' } });
    const client = new AdapterClient(BASE_URL, fetch as unknown as typeof globalThis.fetch);

    await expect(goalGetCurrent(client)).rejects.toMatchObject({
      code: 'validation_error',
      status: 422,
    });
  });

  it('normalizes 500 internal_error', async () => {
    const fetch = mockFetch(500, { error: { code: 'internal_error', message: 'server error' } });
    const client = new AdapterClient(BASE_URL, fetch as unknown as typeof globalThis.fetch);

    await expect(goalGetCurrent(client)).rejects.toMatchObject({
      status: 500,
    });
  });
});
