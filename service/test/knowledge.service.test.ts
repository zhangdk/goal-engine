import { describe, expect, it } from 'vitest';
import { makeTestDb, nowIso } from './helpers.js';
import { GoalRepo } from '../src/repos/goal.repo.js';
import { AttemptRepo } from '../src/repos/attempt.repo.js';
import { KnowledgeRepo } from '../src/repos/knowledge.repo.js';
import { KnowledgePromotionRepo } from '../src/repos/knowledge-promotion.repo.js';
import { KnowledgeService } from '../src/services/knowledge.service.js';

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
});
