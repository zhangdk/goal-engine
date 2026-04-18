import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { makeTestDb, testId, nowIso } from './helpers.js';
import { GoalRepo } from '../src/repos/goal.repo.js';
import { AttemptRepo } from '../src/repos/attempt.repo.js';
import { PolicyRepo } from '../src/repos/policy.repo.js';
import { KnowledgeRepo } from '../src/repos/knowledge.repo.js';
import { KnowledgePromotionRepo } from '../src/repos/knowledge-promotion.repo.js';
import { GoalContractRepo } from '../src/repos/goal-contract.repo.js';
import { GoalCompletionRepo } from '../src/repos/goal-completion.repo.js';
import { RecoveryService } from '../src/services/recovery.service.js';
import { KnowledgeService } from '../src/services/knowledge.service.js';

let db: Database.Database;
let goalRepo: GoalRepo;
let attemptRepo: AttemptRepo;
let policyRepo: PolicyRepo;
let knowledgeRepo: KnowledgeRepo;
let knowledgePromotionRepo: KnowledgePromotionRepo;
let goalContractRepo: GoalContractRepo;
let goalCompletionRepo: GoalCompletionRepo;
let knowledgeService: KnowledgeService;
let recoveryService: RecoveryService;

beforeEach(() => {
  db = makeTestDb();
  goalRepo = new GoalRepo(db);
  attemptRepo = new AttemptRepo(db);
  policyRepo = new PolicyRepo(db);
  knowledgeRepo = new KnowledgeRepo(db);
  knowledgePromotionRepo = new KnowledgePromotionRepo(db);
  goalContractRepo = new GoalContractRepo(db);
  goalCompletionRepo = new GoalCompletionRepo(db);
  knowledgeService = new KnowledgeService(knowledgeRepo, knowledgePromotionRepo);
  recoveryService = new RecoveryService(
    goalRepo,
    attemptRepo,
    policyRepo,
    goalContractRepo,
    goalCompletionRepo,
    knowledgeService
  );
});

/** 创建 active goal */
function createGoal(overrides?: { id?: string }) {
  const id = overrides?.id ?? testId('goal');
  goalRepo.create({
    id,
    title: '测试目标',
    status: 'active',
    successCriteria: ['条件A', '条件B'],
    stopConditions: ['放弃条件X'],
    priority: 1,
    currentStage: 'research',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
  return id;
}

describe('RecoveryService', () => {
  it('composes packet from goal + policy + recent history', () => {
    const goalId = createGoal();

    const failAttemptId = testId('attempt');
    attemptRepo.create({
      id: failAttemptId,
      goalId,
      stage: 'research',
      actionTaken: '搜索文档失败',
      strategyTags: ['broad-web-search'],
      result: 'failure',
      failureType: 'tool_error',
      createdAt: nowIso(),
    });

    policyRepo.upsert({
      id: testId('policy'),
      goalId,
      avoidStrategies: ['broad-web-search'],
      mustCheckBeforeRetry: ['确认不同路径'],
      preferredNextStep: '切换到官方文档',
      updatedAt: nowIso(),
    });

    const packet = recoveryService.build(goalId);

    expect(packet).not.toBeNull();
    expect(packet!.goalId).toBe(goalId);
    expect(packet!.goalTitle).toBe('测试目标');
    expect(packet!.currentStage).toBe('research');
    expect(packet!.successCriteria).toEqual(['条件A', '条件B']);
    expect(packet!.avoidStrategies).toContain('broad-web-search');
    expect(packet!.preferredNextStep).toBe('切换到官方文档');
    expect(packet!.lastFailureSummary).toBeDefined();
    expect(packet!.generatedAt).toBeDefined();
  });

  it('reflects latest policy changes on re-read', () => {
    const goalId = createGoal();

    attemptRepo.create({
      id: testId('attempt'),
      goalId,
      stage: 'research',
      actionTaken: '搜索',
      strategyTags: ['broad-web-search'],
      result: 'failure',
      failureType: 'tool_error',
      createdAt: nowIso(),
    });

    policyRepo.upsert({
      id: testId('policy'),
      goalId,
      avoidStrategies: ['old-strategy'],
      mustCheckBeforeRetry: [],
      updatedAt: nowIso(),
    });

    const before = recoveryService.build(goalId)!;
    expect(before.avoidStrategies).toContain('old-strategy');

    // 更新 policy
    policyRepo.upsert({
      id: testId('policy'),
      goalId,
      avoidStrategies: ['new-strategy'],
      mustCheckBeforeRetry: [],
      updatedAt: nowIso(),
    });

    const after = recoveryService.build(goalId)!;
    expect(after.avoidStrategies).toContain('new-strategy');
    expect(after.avoidStrategies).not.toContain('old-strategy');
  });

  it('derives last_meaningful_progress from latest success/partial attempt action_taken', () => {
    const goalId = createGoal();

    attemptRepo.create({
      id: testId('attempt'),
      goalId,
      stage: 'research',
      actionTaken: '完成了初步调研',
      strategyTags: ['official-docs'],
      result: 'partial',
      createdAt: nowIso(),
    });

    attemptRepo.create({
      id: testId('attempt'),
      goalId,
      stage: 'implementation',
      actionTaken: '尝试实现但失败',
      strategyTags: ['broad-web-search'],
      result: 'failure',
      failureType: 'capability_gap',
      createdAt: nowIso(),
    });

    policyRepo.upsert({
      id: testId('policy'),
      goalId,
      avoidStrategies: [],
      mustCheckBeforeRetry: [],
      updatedAt: nowIso(),
    });

    const packet = recoveryService.build(goalId)!;
    expect(packet.lastMeaningfulProgress).toBe('完成了初步调研');
  });

  it('omits last_meaningful_progress when no success/partial attempt exists', () => {
    const goalId = createGoal();

    attemptRepo.create({
      id: testId('attempt'),
      goalId,
      stage: 'research',
      actionTaken: '搜索失败',
      strategyTags: ['broad-web-search'],
      result: 'failure',
      failureType: 'tool_error',
      createdAt: nowIso(),
    });

    policyRepo.upsert({
      id: testId('policy'),
      goalId,
      avoidStrategies: [],
      mustCheckBeforeRetry: [],
      updatedAt: nowIso(),
    });

    const packet = recoveryService.build(goalId)!;
    expect(packet.lastMeaningfulProgress).toBeUndefined();
  });

  it('includes recent attempts, relevant knowledge, and shared wisdom', () => {
    const goalId = createGoal();

    attemptRepo.create({
      id: 'attempt-a',
      goalId,
      stage: 'search',
      actionTaken: 'Used broad aggregator search',
      strategyTags: ['event_search'],
      result: 'failure',
      failureType: 'tool_error',
      createdAt: nowIso(),
    });

    knowledgeRepo.create({
      id: 'know-a',
      agentId: 'goal-engine-demo',
      goalId,
      sourceAttemptId: 'attempt-a',
      context: 'search stage',
      observation: 'Aggregator result was stale.',
      hypothesis: 'Third-party pages lag organizer pages.',
      implication: 'Check official organizer pages.',
      relatedStrategyTags: ['event_search'],
      createdAt: nowIso(),
    });

    knowledgePromotionRepo.create({
      id: 'promo-a',
      knowledgeId: 'know-a',
      visibility: 'global',
      subject: 'event_search',
      condition: {},
      summary: 'Prefer official sources for events.',
      recommendation: 'Check organizer pages.',
      confidence: 0.8,
      supportCount: 1,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });

    const packet = recoveryService.build('goal-engine-demo', goalId);

    expect(packet?.recentAttempts[0]).toEqual(
      expect.objectContaining({
        actionTaken: 'Used broad aggregator search',
        result: 'failure',
      })
    );
    expect(packet?.relevantKnowledge[0]).toEqual(
      expect.objectContaining({
        observation: 'Aggregator result was stale.',
        implication: 'Check official organizer pages.',
      })
    );
    expect(packet?.sharedWisdom[0]).toEqual(
      expect.objectContaining({
        visibility: 'global',
        subject: 'event_search',
      })
    );
  });

  it('returns null when goal does not exist', () => {
    const packet = recoveryService.build('nonexistent-goal');
    expect(packet).toBeNull();
  });

  it('does not require separate recovery storage (derived on every call)', () => {
    const goalId = createGoal();

    policyRepo.upsert({
      id: testId('policy'),
      goalId,
      avoidStrategies: ['some-strategy'],
      mustCheckBeforeRetry: [],
      updatedAt: nowIso(),
    });

    // 不存在独立的 recovery 表
    const tables = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
      .all() as { name: string }[];
    const tableNames = tables.map(t => t.name);
    expect(tableNames).not.toContain('recovery_packets');

    // 但仍然能生成 packet
    const packet = recoveryService.build(goalId);
    expect(packet).not.toBeNull();
  });
});
