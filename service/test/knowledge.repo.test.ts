import { describe, expect, it } from 'vitest';
import { makeTestDb, nowIso } from './helpers.js';
import { GoalRepo } from '../src/repos/goal.repo.js';
import { KnowledgeRepo } from '../src/repos/knowledge.repo.js';
import { KnowledgePromotionRepo } from '../src/repos/knowledge-promotion.repo.js';

function seedGoal(agentId: string, goalId: string) {
  const db = makeTestDb();
  const goalRepo = new GoalRepo(db);
  goalRepo.create({
    id: goalId,
    agentId,
    title: `${agentId} goal`,
    status: 'active',
    successCriteria: ['succeed'],
    stopConditions: [],
    priority: 1,
    currentStage: 'search',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
  return { db, goalRepo };
}

describe('KnowledgeRepo', () => {
  it('creates and lists knowledge scoped to one agent and goal', () => {
    const { db } = seedGoal('agent-a', 'goal-a');
    const repo = new KnowledgeRepo(db);

    repo.create({
      id: 'know-a',
      agentId: 'agent-a',
      goalId: 'goal-a',
      context: 'search stage',
      observation: 'aggregator failed',
      hypothesis: 'stale index',
      implication: 'check official sources',
      relatedStrategyTags: ['event_search'],
      createdAt: nowIso(),
    });

    expect(repo.listByGoal('agent-a', 'goal-a')).toHaveLength(1);
    expect(repo.listByGoal('agent-b', 'goal-a')).toHaveLength(0);
  });

  it('rejects knowledge for another agent goal', () => {
    const { db } = seedGoal('agent-a', 'goal-a');
    const repo = new KnowledgeRepo(db);

    expect(() => repo.create({
      id: 'know-cross',
      agentId: 'agent-b',
      goalId: 'goal-a',
      context: 'bad context',
      observation: 'bad observation',
      hypothesis: 'bad hypothesis',
      implication: 'bad implication',
      relatedStrategyTags: [],
      createdAt: nowIso(),
    })).toThrow();
  });
});

describe('KnowledgePromotionRepo', () => {
  it('returns agent scoped and global wisdom without returning another agent private wisdom', () => {
    const { db } = seedGoal('agent-a', 'goal-a');
    const knowledgeRepo = new KnowledgeRepo(db);
    const promotionRepo = new KnowledgePromotionRepo(db);

    knowledgeRepo.create({
      id: 'know-a',
      agentId: 'agent-a',
      goalId: 'goal-a',
      context: 'search stage',
      observation: 'aggregator failed',
      hypothesis: 'stale index',
      implication: 'check official sources',
      relatedStrategyTags: ['event_search'],
      createdAt: nowIso(),
    });

    promotionRepo.create({
      id: 'promo-agent-a',
      knowledgeId: 'know-a',
      visibility: 'agent',
      agentId: 'agent-a',
      subject: 'event_search',
      condition: { stage: 'search' },
      summary: 'Aggregators can be stale.',
      recommendation: 'Check official sources.',
      confidence: 0.7,
      supportCount: 1,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });

    promotionRepo.create({
      id: 'promo-global',
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

    expect(promotionRepo.listSharedForAgent('agent-a', ['event_search']).map((p) => p.id)).toEqual(
      expect.arrayContaining(['promo-agent-a', 'promo-global'])
    );
    expect(promotionRepo.listSharedForAgent('agent-b', ['event_search']).map((p) => p.id)).toEqual(['promo-global']);
  });
});
