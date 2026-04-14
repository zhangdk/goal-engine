import { describe, expect, it } from 'vitest';
import { makeTestDb, nowIso } from './helpers.js';
import { GoalRepo } from '../src/repos/goal.repo.js';
import { AttemptRepo } from '../src/repos/attempt.repo.js';
import { KnowledgeRepo } from '../src/repos/knowledge.repo.js';
import { KnowledgePromotionRepo } from '../src/repos/knowledge-promotion.repo.js';
import { KnowledgeService } from '../src/services/knowledge.service.js';
import type Database from 'better-sqlite3';

describe('KnowledgeService', () => {
  it('builds descriptive knowledge from a failed attempt and reflection', () => {
    const db = makeTestDb();
    const goalRepo = new GoalRepo(db);
    const attemptRepo = new AttemptRepo(db);
    const knowledgeRepo = new KnowledgeRepo(db);
    const promotionRepo = new KnowledgePromotionRepo(db);
    const service = new KnowledgeService(knowledgeRepo, promotionRepo);

    goalRepo.create({
      id: 'goal-a',
      agentId: 'agent-a',
      title: 'Find event',
      status: 'active',
      successCriteria: ['Find one event'],
      stopConditions: [],
      priority: 1,
      currentStage: 'search',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });

    attemptRepo.create({
      id: 'attempt-a',
      agentId: 'agent-a',
      goalId: 'goal-a',
      stage: 'search',
      actionTaken: 'Used broad aggregator search',
      strategyTags: ['event_search'],
      result: 'failure',
      failureType: 'tool_error',
      createdAt: nowIso(),
    });

    const knowledge = service.createFromReflection({
      agentId: 'agent-a',
      goalId: 'goal-a',
      attemptId: 'attempt-a',
      stage: 'search',
      actionTaken: 'Used broad aggregator search',
      strategyTags: ['event_search'],
      summary: 'Aggregator result was stale.',
      rootCause: 'Third-party pages lag organizer pages.',
      mustChange: 'Check official organizer pages.',
      createdAt: nowIso(),
    });

    expect(knowledge.context).toContain('search');
    expect(knowledge.observation).toBe('Aggregator result was stale.');
    expect(knowledge.hypothesis).toBe('Third-party pages lag organizer pages.');
    expect(knowledge.implication).toBe('Check official organizer pages.');
    expect(knowledge.relatedStrategyTags).toEqual(['event_search']);
    expect(knowledgeRepo.listByGoal('agent-a', 'goal-a')).toHaveLength(1);
  });

  it('recordReference() on knowledge with no existing promotion creates an agent promotion', () => {
    const db = makeTestDb();
    const knowledgeRepo = new KnowledgeRepo(db);
    const promotionRepo = new KnowledgePromotionRepo(db);
    const service = new KnowledgeService(knowledgeRepo, promotionRepo);

    // Create agent and goal first (foreign key constraints)
    db.prepare(`INSERT INTO agents (id, display_name, created_at) VALUES (?, ?, ?)`)
      .run('agent-b', 'Agent B', nowIso());
    db.prepare(`INSERT INTO goals (id, agent_id, title, status, success_criteria, stop_conditions, priority, current_stage, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('goal-b', 'agent-b', 'Test Goal', 'active', '[]', '[]', 1, 'search', nowIso(), nowIso());

    knowledgeRepo.create({
      id: 'know-b',
      agentId: 'agent-b',
      goalId: 'goal-b',
      context: 'test context',
      observation: 'Long observation text that needs to be truncated to 200 characters for the summary field in the auto-promotion',
      hypothesis: 'test hypothesis',
      implication: 'Check official sources first.',
      relatedStrategyTags: ['test-tag'],
      createdAt: nowIso(),
    });

    // Initially no promotions
    const before = promotionRepo.listSharedForAgent('agent-b', undefined, [], 100);
    expect(before.filter(p => p.knowledgeId === 'know-b')).toHaveLength(0);

    // Record reference - should create an agent promotion
    service.recordReference('know-b', 'agent-b');

    const after = promotionRepo.listSharedForAgent('agent-b', undefined, [], 100);
    const agentPromotions = after.filter(p => p.knowledgeId === 'know-b' && p.visibility === 'agent');
    expect(agentPromotions).toHaveLength(1);
    expect(agentPromotions[0].subject).toBe('general');
    expect(agentPromotions[0].supportCount).toBe(1);
    expect(agentPromotions[0].recommendation).toBe('Check official sources first.');
  });

  it('recordReference() on knowledge with existing agent promotion increments support_count', () => {
    const db = makeTestDb();
    const knowledgeRepo = new KnowledgeRepo(db);
    const promotionRepo = new KnowledgePromotionRepo(db);
    const service = new KnowledgeService(knowledgeRepo, promotionRepo);

    // Create agent and goal first (foreign key constraints)
    db.prepare(`INSERT INTO agents (id, display_name, created_at) VALUES (?, ?, ?)`)
      .run('agent-c', 'Agent C', nowIso());
    db.prepare(`INSERT INTO goals (id, agent_id, title, status, success_criteria, stop_conditions, priority, current_stage, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('goal-c', 'agent-c', 'Test Goal', 'active', '[]', '[]', 1, 'search', nowIso(), nowIso());

    knowledgeRepo.create({
      id: 'know-c',
      agentId: 'agent-c',
      goalId: 'goal-c',
      context: 'test context',
      observation: 'Test observation',
      hypothesis: 'test hypothesis',
      implication: 'Do something different.',
      relatedStrategyTags: ['test-tag'],
      createdAt: nowIso(),
    });

    // Create initial agent promotion
    promotionRepo.create({
      id: 'promo-c',
      knowledgeId: 'know-c',
      visibility: 'agent',
      agentId: 'agent-c',
      subject: 'general',
      condition: {},
      summary: 'Test summary',
      recommendation: 'Do something different.',
      confidence: 0.5,
      supportCount: 1,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });

    // Record reference - should increment support count
    service.recordReference('know-c', 'agent-c');

    const promotions = promotionRepo.listSharedForAgent('agent-c', undefined, [], 100);
    const agentPromotions = promotions.filter(p => p.knowledgeId === 'know-c' && p.visibility === 'agent');
    expect(agentPromotions).toHaveLength(1);
    expect(agentPromotions[0].supportCount).toBe(2);
  });
});
