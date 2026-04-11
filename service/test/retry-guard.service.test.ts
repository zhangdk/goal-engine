import { describe, it, expect } from 'vitest';
import { RetryGuardService } from '../src/services/retry-guard.service.js';
import type { Attempt, Policy } from '../../shared/types.js';

const guardService = new RetryGuardService();

/** 构建最小 failure attempt fixture */
function makeAttempt(strategyTags: string[]): Attempt {
  return {
    id: 'attempt_1',
    goalId: 'goal_1',
    stage: 'research',
    actionTaken: '搜索',
    strategyTags,
    result: 'failure',
    failureType: 'tool_error',
    createdAt: new Date().toISOString(),
  };
}

/** 构建最小 policy fixture */
function makePolicy(avoidStrategies: string[]): Policy {
  return {
    id: 'policy_1',
    goalId: 'goal_1',
    avoidStrategies,
    mustCheckBeforeRetry: ['确认路径不同'],
    updatedAt: new Date().toISOString(),
  };
}

// ─── 阻断场景 ─────────────────────────────────────────────────────────────────

describe('RetryGuardService — blocks', () => {
  it('blocks when policy_acknowledged is false', () => {
    const result = guardService.check({
      policyAcknowledged: false,
      strategyTags: ['broad-web-search'],
      whatChanged: '换了一个搜索路径',
      policy: makePolicy([]),
      latestFailureAttempt: makeAttempt(['broad-web-search']),
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('policy_not_acknowledged');
  });

  it('blocks when strategy_tags overlap with avoid_strategies', () => {
    const result = guardService.check({
      policyAcknowledged: true,
      strategyTags: ['broad-web-search'],
      whatChanged: '换了方向',
      policy: makePolicy(['broad-web-search']),
      latestFailureAttempt: makeAttempt(['official-docs']),
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('blocked_strategy_overlap');
  });

  it('blocks when nothing meaningful changed (empty what_changed)', () => {
    const result = guardService.check({
      policyAcknowledged: true,
      strategyTags: ['broad-web-search'],
      whatChanged: '',
      policy: makePolicy([]),
      latestFailureAttempt: makeAttempt(['broad-web-search']),
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('no_meaningful_change');
  });

  it('blocks when strategy_tags exactly match the last failure attempt', () => {
    const result = guardService.check({
      policyAcknowledged: true,
      strategyTags: ['broad-web-search', 'official-docs'],
      whatChanged: '',
      policy: makePolicy([]),
      latestFailureAttempt: makeAttempt(['broad-web-search', 'official-docs']),
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('no_meaningful_change');
  });

  it('blocks when overlap rate >= 0.7 and what_changed is not meaningful', () => {
    // 3 tags, 2 overlap = 0.667 < 0.7 → should NOT trigger overlap-similarity alone
    // 3 tags, 3 overlap = 1.0 >= 0.7
    const result = guardService.check({
      policyAcknowledged: true,
      strategyTags: ['tag-a', 'tag-b', 'tag-c'],
      whatChanged: '稍微调整了一下',  // 模糊，不构成明确变化
      policy: makePolicy([]),
      latestFailureAttempt: makeAttempt(['tag-a', 'tag-b', 'tag-c']),
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('no_meaningful_change');
  });

  it('blocks repeated same failure type without downgrade when no downgrade signals', () => {
    // 连续同类失败，标签完全相同，whatChanged 存在但不含降维关键词
    // → repeated_failure_without_downgrade
    const result = guardService.check({
      policyAcknowledged: true,
      strategyTags: ['broad-web-search'],  // 与上次相同，无新标签
      whatChanged: '调整了一点参数',  // 存在 whatChanged，但不含降维/换工具/新搜索等明确信号
      policy: makePolicy([]),
      latestFailureAttempt: makeAttempt(['broad-web-search']),
      consecutiveFailureType: 'tool_error',
    });

    expect(result.allowed).toBe(false);
    expect(result.reason).toBe('repeated_failure_without_downgrade');
  });
});

// ─── 允许场景 ─────────────────────────────────────────────────────────────────

describe('RetryGuardService — allows', () => {
  it('allows when meaningful change: new strategy tag', () => {
    const result = guardService.check({
      policyAcknowledged: true,
      strategyTags: ['official-docs'],  // 全新标签
      whatChanged: '切换到官方文档',
      policy: makePolicy([]),
      latestFailureAttempt: makeAttempt(['broad-web-search']),
    });

    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('allowed');
  });

  it('allows when what_changed explicitly mentions switching to smaller subtask', () => {
    const result = guardService.check({
      policyAcknowledged: true,
      strategyTags: ['broad-web-search'],  // 标签相同
      whatChanged: '切换到更小子任务：只处理认证部分',
      policy: makePolicy([]),
      latestFailureAttempt: makeAttempt(['broad-web-search']),
    });

    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('allowed');
  });

  it('allows when what_changed explicitly mentions new tool', () => {
    const result = guardService.check({
      policyAcknowledged: true,
      strategyTags: ['broad-web-search'],
      whatChanged: '切换到新工具 ripgrep 替代之前的 grep',
      policy: makePolicy([]),
      latestFailureAttempt: makeAttempt(['broad-web-search']),
    });

    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('allowed');
  });

  it('allows when what_changed explicitly mentions new input material', () => {
    const result = guardService.check({
      policyAcknowledged: true,
      strategyTags: ['broad-web-search'],
      whatChanged: '引入了新输入材料：数据库 schema 文件',
      policy: makePolicy([]),
      latestFailureAttempt: makeAttempt(['broad-web-search']),
    });

    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('allowed');
  });

  it('allows when what_changed explicitly mentions new search path', () => {
    const result = guardService.check({
      policyAcknowledged: true,
      strategyTags: ['broad-web-search'],
      whatChanged: '切换到新搜索路径：GitHub issue tracker',
      policy: makePolicy([]),
      latestFailureAttempt: makeAttempt(['broad-web-search']),
    });

    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('allowed');
  });

  it('allows when what_changed explicitly mentions requesting external help', () => {
    const result = guardService.check({
      policyAcknowledged: true,
      strategyTags: ['broad-web-search'],
      whatChanged: '请求外部帮助：向团队成员咨询',
      policy: makePolicy([]),
      latestFailureAttempt: makeAttempt(['broad-web-search']),
    });

    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('allowed');
  });

  it('allows when there is no prior failure attempt', () => {
    const result = guardService.check({
      policyAcknowledged: true,
      strategyTags: ['broad-web-search'],
      whatChanged: '',
      policy: makePolicy([]),
      latestFailureAttempt: null,  // 无历史失败
    });

    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('allowed');
  });
});

// ─── Overlap 计算 ─────────────────────────────────────────────────────────────

describe('RetryGuardService — overlap rate', () => {
  it('includes tagOverlapRate in result when there is a prior attempt', () => {
    const result = guardService.check({
      policyAcknowledged: true,
      strategyTags: ['tag-a', 'tag-b', 'tag-c'],
      whatChanged: '切换了搜索路径',
      policy: makePolicy([]),
      latestFailureAttempt: makeAttempt(['tag-a', 'tag-b']),
    });

    expect(result.tagOverlapRate).toBeDefined();
    // 2 out of 3 current tags appear in prior => 2/3 ≈ 0.667
    expect(result.tagOverlapRate).toBeCloseTo(2 / 3, 2);
  });

  it('reports 0 overlap when tags are completely different', () => {
    const result = guardService.check({
      policyAcknowledged: true,
      strategyTags: ['narrowed-scope'],
      whatChanged: '切换了搜索路径',
      policy: makePolicy([]),
      latestFailureAttempt: makeAttempt(['broad-web-search']),
    });

    expect(result.tagOverlapRate).toBe(0);
  });
});
