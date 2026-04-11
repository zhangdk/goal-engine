import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { makeTestDb, testId, nowIso } from './helpers.js';
import { GoalRepo } from '../src/repos/goal.repo.js';
import { AttemptRepo } from '../src/repos/attempt.repo.js';
import { ReflectionRepo } from '../src/repos/reflection.repo.js';
import { PolicyRepo } from '../src/repos/policy.repo.js';

let db: Database.Database;
let goalRepo: GoalRepo;
let attemptRepo: AttemptRepo;
let reflectionRepo: ReflectionRepo;
let policyRepo: PolicyRepo;

beforeEach(() => {
  db = makeTestDb();
  goalRepo = new GoalRepo(db);
  attemptRepo = new AttemptRepo(db);
  reflectionRepo = new ReflectionRepo(db);
  policyRepo = new PolicyRepo(db);
});

// ─── Goal Repo ────────────────────────────────────────────────────────────────

describe('GoalRepo', () => {
  it('creates and retrieves current active goal', () => {
    const id = testId('goal');
    goalRepo.create({
      id,
      title: '测试目标',
      status: 'active',
      successCriteria: ['达成条件A'],
      stopConditions: ['停止条件X'],
      priority: 1,
      currentStage: 'research',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });

    const current = goalRepo.getCurrent();
    expect(current).not.toBeNull();
    expect(current?.id).toBe(id);
    expect(current?.title).toBe('测试目标');
    expect(current?.successCriteria).toEqual(['达成条件A']);
  });

  it('only one active goal is allowed at a time', () => {
    goalRepo.create({
      id: testId('goal'),
      title: 'Goal 1',
      status: 'active',
      successCriteria: [],
      stopConditions: [],
      priority: 1,
      currentStage: 'init',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });

    expect(() =>
      goalRepo.create({
        id: testId('goal'),
        title: 'Goal 2',
        status: 'active',
        successCriteria: [],
        stopConditions: [],
        priority: 1,
        currentStage: 'init',
        createdAt: nowIso(),
        updatedAt: nowIso(),
      })
    ).toThrow();
  });

  it('allows one active goal per agent and scopes direct lookup by agent', () => {
    const agentAGoalId = testId('goal');
    const agentBGoalId = testId('goal');
    goalRepo.create({
      id: agentAGoalId,
      agentId: 'agent-a',
      title: 'Agent A Goal',
      status: 'active',
      successCriteria: [],
      stopConditions: [],
      priority: 1,
      currentStage: 'init',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });

    expect(() => goalRepo.create({
      id: agentBGoalId,
      agentId: 'agent-b',
      title: 'Agent B Goal',
      status: 'active',
      successCriteria: [],
      stopConditions: [],
      priority: 1,
      currentStage: 'init',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    })).not.toThrow();

    expect(goalRepo.getCurrent('agent-a')?.id).toBe(agentAGoalId);
    expect(goalRepo.getCurrent('agent-b')?.id).toBe(agentBGoalId);
    expect(goalRepo.getById('agent-b', agentAGoalId)).toBeNull();
  });

  it('allows creating a new active goal after completing the previous one', () => {
    const id = testId('goal');
    goalRepo.create({
      id,
      title: 'Goal 1',
      status: 'active',
      successCriteria: [],
      stopConditions: [],
      priority: 1,
      currentStage: 'init',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });

    goalRepo.patch(id, { status: 'completed', updatedAt: nowIso() });

    expect(() =>
      goalRepo.create({
        id: testId('goal'),
        title: 'Goal 2',
        status: 'active',
        successCriteria: [],
        stopConditions: [],
        priority: 1,
        currentStage: 'init',
        createdAt: nowIso(),
        updatedAt: nowIso(),
      })
    ).not.toThrow();
  });

  it('patches allowed fields', () => {
    const id = testId('goal');
    goalRepo.create({
      id,
      title: 'Goal',
      status: 'active',
      successCriteria: [],
      stopConditions: [],
      priority: 1,
      currentStage: 'init',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });

    goalRepo.patch(id, { currentStage: 'execution', status: 'blocked', updatedAt: nowIso() });
    const g = goalRepo.getById(id);
    expect(g?.currentStage).toBe('execution');
    expect(g?.status).toBe('blocked');
  });
});

// ─── Attempt Repo ─────────────────────────────────────────────────────────────

describe('AttemptRepo', () => {
  let goalId: string;

  beforeEach(() => {
    goalId = testId('goal');
    goalRepo.create({
      id: goalId,
      title: 'Parent Goal',
      status: 'active',
      successCriteria: [],
      stopConditions: [],
      priority: 1,
      currentStage: 'init',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  });

  it('creates and lists attempts for a goal', () => {
    const id = testId('attempt');
    attemptRepo.create({
      id,
      goalId,
      stage: 'research',
      actionTaken: '搜索文档',
      strategyTags: ['broad-web-search'],
      result: 'failure',
      failureType: 'tool_error',
      createdAt: nowIso(),
    });

    const list = attemptRepo.listByGoal(goalId);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(id);
    expect(list[0].strategyTags).toEqual(['broad-web-search']);
  });

  it('does not list another agent attempt history', () => {
    const id = testId('attempt');
    attemptRepo.create({
      id,
      agentId: 'goal-engine-demo',
      goalId,
      stage: 'research',
      actionTaken: '搜索文档',
      strategyTags: ['private-path'],
      result: 'failure',
      failureType: 'tool_error',
      createdAt: nowIso(),
    });

    expect(attemptRepo.listByGoal('goal-engine-demo', goalId)).toHaveLength(1);
    expect(attemptRepo.listByGoal('agent-b', goalId)).toEqual([]);
    expect(attemptRepo.getById('agent-b', id)).toBeNull();
  });

  it('rejects failure attempt without failure_type', () => {
    expect(() =>
      attemptRepo.create({
        id: testId('attempt'),
        goalId,
        stage: 'research',
        actionTaken: '搜索',
        strategyTags: [],
        result: 'failure',
        // failureType intentionally omitted
        createdAt: nowIso(),
      })
    ).toThrow();
  });

  it('allows success attempt without failure_type', () => {
    expect(() =>
      attemptRepo.create({
        id: testId('attempt'),
        goalId,
        stage: 'research',
        actionTaken: '完成搜索',
        strategyTags: ['official-docs'],
        result: 'success',
        createdAt: nowIso(),
      })
    ).not.toThrow();
  });

  it('getLatestFailure returns the most recent failure attempt', () => {
    const first = testId('attempt');
    const second = testId('attempt');

    attemptRepo.create({
      id: first,
      goalId,
      stage: 'research',
      actionTaken: '第一次搜索',
      strategyTags: ['broad-web-search'],
      result: 'failure',
      failureType: 'tool_error',
      createdAt: new Date(Date.now() - 10000).toISOString(),
    });

    attemptRepo.create({
      id: second,
      goalId,
      stage: 'research',
      actionTaken: '第二次搜索',
      strategyTags: ['official-docs'],
      result: 'failure',
      failureType: 'capability_gap',
      createdAt: nowIso(),
    });

    const latest = attemptRepo.getLatestFailure(goalId);
    expect(latest?.id).toBe(second);
  });
});

// ─── Reflection Repo ──────────────────────────────────────────────────────────

describe('ReflectionRepo', () => {
  let goalId: string;
  let attemptId: string;

  beforeEach(() => {
    goalId = testId('goal');
    attemptId = testId('attempt');

    goalRepo.create({
      id: goalId,
      title: 'Parent Goal',
      status: 'active',
      successCriteria: [],
      stopConditions: [],
      priority: 1,
      currentStage: 'init',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });

    attemptRepo.create({
      id: attemptId,
      goalId,
      stage: 'research',
      actionTaken: '搜索文档',
      strategyTags: ['broad-web-search'],
      result: 'failure',
      failureType: 'tool_error',
      createdAt: nowIso(),
    });
  });

  it('creates a reflection for a failure attempt', () => {
    const id = testId('reflection');
    reflectionRepo.create({
      id,
      goalId,
      attemptId,
      summary: '搜索未找到答案',
      rootCause: '搜索词太泛',
      mustChange: '切换到官方文档',
      avoidStrategy: 'broad-web-search',
      createdAt: nowIso(),
    });

    const r = reflectionRepo.getByAttemptId(attemptId);
    expect(r).not.toBeNull();
    expect(r?.id).toBe(id);
    expect(r?.avoidStrategy).toBe('broad-web-search');
  });

  it('one attempt can have at most one reflection', () => {
    reflectionRepo.create({
      id: testId('reflection'),
      goalId,
      attemptId,
      summary: '第一次',
      rootCause: '原因',
      mustChange: '改变',
      createdAt: nowIso(),
    });

    expect(() =>
      reflectionRepo.create({
        id: testId('reflection'),
        goalId,
        attemptId,
        summary: '第二次',
        rootCause: '原因',
        mustChange: '改变',
        createdAt: nowIso(),
      })
    ).toThrow();
  });
});

// ─── Policy Repo ──────────────────────────────────────────────────────────────

describe('PolicyRepo', () => {
  let goalId: string;

  beforeEach(() => {
    goalId = testId('goal');
    goalRepo.create({
      id: goalId,
      title: 'Parent Goal',
      status: 'active',
      successCriteria: [],
      stopConditions: [],
      priority: 1,
      currentStage: 'init',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
  });

  it('upserts and retrieves policy for a goal', () => {
    policyRepo.upsert({
      id: testId('policy'),
      goalId,
      avoidStrategies: ['broad-web-search'],
      mustCheckBeforeRetry: ['检查是否有更小的子任务'],
      preferredNextStep: '切换到官方文档',
      updatedAt: nowIso(),
    });

    const p = policyRepo.getByGoal(goalId);
    expect(p).not.toBeNull();
    expect(p?.avoidStrategies).toEqual(['broad-web-search']);
    expect(p?.preferredNextStep).toBe('切换到官方文档');
  });

  it('one goal has only one current policy (upsert replaces)', () => {
    const firstId = testId('policy');
    policyRepo.upsert({
      id: firstId,
      goalId,
      avoidStrategies: ['old-strategy'],
      mustCheckBeforeRetry: [],
      updatedAt: nowIso(),
    });

    policyRepo.upsert({
      id: testId('policy'),
      goalId,
      avoidStrategies: ['new-strategy'],
      mustCheckBeforeRetry: [],
      updatedAt: nowIso(),
    });

    const p = policyRepo.getByGoal(goalId);
    expect(p?.avoidStrategies).toEqual(['new-strategy']);
  });
});
