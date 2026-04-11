import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { makeTestDb, testId, nowIso } from './helpers.js';
import { GoalRepo } from '../src/repos/goal.repo.js';
import { AttemptRepo } from '../src/repos/attempt.repo.js';
import { ReflectionRepo } from '../src/repos/reflection.repo.js';
import { PolicyRepo } from '../src/repos/policy.repo.js';
import { PolicyService } from '../src/services/policy.service.js';

let db: Database.Database;
let goalRepo: GoalRepo;
let attemptRepo: AttemptRepo;
let reflectionRepo: ReflectionRepo;
let policyRepo: PolicyRepo;
let policyService: PolicyService;

/** 快速创建 active goal + failure attempt */
function makeGoalAndFailureAttempt(overrides?: { strategyTags?: string[] }) {
  const goalId = testId('goal');
  const attemptId = testId('attempt');

  goalRepo.create({
    id: goalId,
    title: '测试目标',
    status: 'active',
    successCriteria: ['达成条件A'],
    stopConditions: [],
    priority: 1,
    currentStage: 'research',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });

  attemptRepo.create({
    id: attemptId,
    goalId,
    stage: 'research',
    actionTaken: '搜索文档',
    strategyTags: overrides?.strategyTags ?? ['broad-web-search'],
    result: 'failure',
    failureType: 'tool_error',
    createdAt: nowIso(),
  });

  return { goalId, attemptId };
}

beforeEach(() => {
  db = makeTestDb();
  goalRepo = new GoalRepo(db);
  attemptRepo = new AttemptRepo(db);
  reflectionRepo = new ReflectionRepo(db);
  policyRepo = new PolicyRepo(db);
  policyService = new PolicyService(db, goalRepo, attemptRepo, reflectionRepo, policyRepo);
});

// ─── Policy Service 测试 ──────────────────────────────────────────────────────

describe('PolicyService', () => {
  it('creates a new policy from the first reflection', () => {
    const { goalId, attemptId } = makeGoalAndFailureAttempt();

    const result = policyService.writeReflectionAndUpdatePolicy({
      reflectionId: testId('reflection'),
      goalId,
      attemptId,
      summary: '搜索未找到答案',
      rootCause: '搜索词太泛',
      mustChange: '切换到官方文档',
      avoidStrategy: 'broad-web-search',
      createdAt: nowIso(),
    });

    expect(result.reflection.id).toBeDefined();
    expect(result.policy.goalId).toBe(goalId);
    expect(result.policy.avoidStrategies).toContain('broad-web-search');
    expect(result.policy.mustCheckBeforeRetry.length).toBeGreaterThan(0);
  });

  it('merges avoid_strategy idempotently across multiple reflections', () => {
    const goalId = testId('goal');
    goalRepo.create({
      id: goalId,
      title: '目标',
      status: 'active',
      successCriteria: [],
      stopConditions: [],
      priority: 1,
      currentStage: 'init',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });

    // 第一次 reflection
    const attemptId1 = testId('attempt');
    attemptRepo.create({
      id: attemptId1,
      goalId,
      stage: 'research',
      actionTaken: '搜索',
      strategyTags: ['broad-web-search'],
      result: 'failure',
      failureType: 'tool_error',
      createdAt: new Date(Date.now() - 2000).toISOString(),
    });

    policyService.writeReflectionAndUpdatePolicy({
      reflectionId: testId('reflection'),
      goalId,
      attemptId: attemptId1,
      summary: '摘要1',
      rootCause: '原因1',
      mustChange: '改变1',
      avoidStrategy: 'broad-web-search',
      createdAt: new Date(Date.now() - 2000).toISOString(),
    });

    // 第二次 reflection，相同 avoid_strategy
    const attemptId2 = testId('attempt');
    attemptRepo.create({
      id: attemptId2,
      goalId,
      stage: 'research',
      actionTaken: '再次搜索',
      strategyTags: ['broad-web-search'],
      result: 'failure',
      failureType: 'tool_error',
      createdAt: nowIso(),
    });

    policyService.writeReflectionAndUpdatePolicy({
      reflectionId: testId('reflection'),
      goalId,
      attemptId: attemptId2,
      summary: '摘要2',
      rootCause: '原因2',
      mustChange: '改变2',
      avoidStrategy: 'broad-web-search',  // 重复标签
      createdAt: nowIso(),
    });

    const policy = policyRepo.getByGoal(goalId)!;
    const count = policy.avoidStrategies.filter(s => s === 'broad-web-search').length;
    expect(count).toBe(1);  // 不重复
  });

  it('updates preferred_next_step from the latest reflection mustChange', () => {
    const { goalId, attemptId } = makeGoalAndFailureAttempt();

    const result = policyService.writeReflectionAndUpdatePolicy({
      reflectionId: testId('reflection'),
      goalId,
      attemptId,
      summary: '摘要',
      rootCause: '原因',
      mustChange: '切换到 official-docs',
      avoidStrategy: 'broad-web-search',
      createdAt: nowIso(),
    });

    expect(result.policy.preferredNextStep).toBe('切换到 official-docs');
  });

  it('sets a non-empty must_check_before_retry by default', () => {
    const { goalId, attemptId } = makeGoalAndFailureAttempt();

    const result = policyService.writeReflectionAndUpdatePolicy({
      reflectionId: testId('reflection'),
      goalId,
      attemptId,
      summary: '摘要',
      rootCause: '原因',
      mustChange: '改变',
      createdAt: nowIso(),
    });

    expect(result.policy.mustCheckBeforeRetry.length).toBeGreaterThan(0);
  });

  it('rolls back both reflection and policy if policy upsert fails', () => {
    // 通过传入无效 goalId 触发外键约束违反
    const fakeGoalId = 'nonexistent-goal-id';
    const fakeAttemptId = 'nonexistent-attempt-id';

    expect(() =>
      policyService.writeReflectionAndUpdatePolicy({
        reflectionId: testId('reflection'),
        goalId: fakeGoalId,
        attemptId: fakeAttemptId,
        summary: '摘要',
        rootCause: '原因',
        mustChange: '改变',
        createdAt: nowIso(),
      })
    ).toThrow();

    // 事务回滚后，数据库中不应有任何 reflection
    const allReflections = db.prepare('SELECT * FROM reflections').all();
    expect(allReflections).toHaveLength(0);
  });
});
