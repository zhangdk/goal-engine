import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { GoalRepo } from '../repos/goal.repo.js';
import type { AttemptRepo } from '../repos/attempt.repo.js';
import type { KnowledgeService } from '../services/knowledge.service.js';
import type { Knowledge, KnowledgePromotion } from '../../../shared/types.js';
import { resolveAgentContext } from '../agent-context.js';

const createKnowledgeSchema = z.object({
  goal_id: z.string().min(1),
  source_attempt_id: z.string().min(1).optional(),
  context: z.string().min(1),
  observation: z.string().min(1),
  hypothesis: z.string().min(1),
  implication: z.string().min(1),
  related_strategy_tags: z.array(z.string()),
});

const promoteKnowledgeSchema = z.object({
  visibility: z.enum(['private', 'agent', 'global']),
  reviewed: z.boolean().optional(),
  subject: z.string().min(1),
  condition: z.record(z.unknown()).default({}),
  summary: z.string().min(1),
  recommendation: z.string().min(1),
  confidence: z.number().min(0).max(1).default(0.5),
});

export function knowledgeRouter(
  goalRepo: GoalRepo,
  attemptRepo: AttemptRepo,
  knowledgeService: KnowledgeService
): Hono {
  const router = new Hono();

  router.post('/', zValidator('json', createKnowledgeSchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: { code: 'validation_error', details: result.error.issues } }, 422);
    }
  }), (c) => {
    const { agentId } = resolveAgentContext(c.req.raw.headers);
    const data = c.req.valid('json');
    const goal = goalRepo.getById(agentId, data.goal_id);
    if (!goal) {
      return c.json({ error: { code: 'not_found', message: 'Goal not found' } }, 404);
    }

    if (data.source_attempt_id) {
      const attempt = attemptRepo.getById(agentId, data.source_attempt_id);
      if (!attempt || attempt.goalId !== data.goal_id) {
        return c.json({ error: { code: 'not_found', message: 'Attempt not found' } }, 404);
      }
    }

    const knowledge = knowledgeService.create({
      agentId,
      goalId: data.goal_id,
      sourceAttemptId: data.source_attempt_id,
      context: data.context,
      observation: data.observation,
      hypothesis: data.hypothesis,
      implication: data.implication,
      relatedStrategyTags: data.related_strategy_tags,
    });

    return c.json({ data: knowledgeToSnakeCase(knowledge) }, 201);
  });

  router.get('/', (c) => {
    const { agentId } = resolveAgentContext(c.req.raw.headers);
    const goalId = c.req.query('goal_id');
    if (!goalId) {
      return c.json({ error: { code: 'validation_error', message: 'goal_id is required' } }, 422);
    }

    const goal = goalRepo.getById(agentId, goalId);
    if (!goal) {
      return c.json({ error: { code: 'not_found', message: 'Goal not found' } }, 404);
    }

    const limitRaw = c.req.query('limit');
    const limit = limitRaw ? Math.min(Math.max(parseInt(limitRaw, 10) || 20, 1), 100) : 20;
    const knowledge = knowledgeService.listByGoal(agentId, goalId, limit);
    return c.json({ data: knowledge.map(knowledgeToSnakeCase), meta: { limit } });
  });

  router.get('/shared', (c) => {
    const { agentId } = resolveAgentContext(c.req.raw.headers);
    const goalId = c.req.query('goal_id');
    const subjects = (c.req.query('subjects') ?? '')
      .split(',')
      .map((subject) => subject.trim())
      .filter(Boolean);
    const limitRaw = c.req.query('limit');
    const limit = limitRaw ? Math.min(Math.max(parseInt(limitRaw, 10) || 20, 1), 100) : 20;
    const promotions = knowledgeService.listSharedWisdom(agentId, goalId, subjects, limit);
    return c.json({ data: promotions.map(promotionToSnakeCase), meta: { limit } });
  });

  router.post('/:knowledgeId/promotions', zValidator('json', promoteKnowledgeSchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: { code: 'validation_error', details: result.error.issues } }, 422);
    }
  }), (c) => {
    const { agentId } = resolveAgentContext(c.req.raw.headers);
    const knowledgeId = c.req.param('knowledgeId');
    const data = c.req.valid('json');
    const knowledge = knowledgeService.get(agentId, knowledgeId);
    if (!knowledge) {
      return c.json({ error: { code: 'not_found', message: 'Knowledge not found' } }, 404);
    }

    if (data.visibility === 'global' && data.reviewed !== true) {
      return c.json({
        error: {
          code: 'review_required',
          message: 'Global knowledge promotion requires reviewed=true',
        },
      }, 403);
    }

    const promotion = knowledgeService.promote({
      knowledgeId,
      visibility: data.visibility,
      agentId: data.visibility === 'global' ? undefined : agentId,
      subject: data.subject,
      condition: data.condition,
      summary: data.summary,
      recommendation: data.recommendation,
      confidence: data.confidence,
    });

    return c.json({ data: promotionToSnakeCase(promotion) }, 201);
  });

  return router;
}

export function knowledgeToSnakeCase(knowledge: Knowledge) {
  return {
    id: knowledge.id,
    agent_id: knowledge.agentId,
    goal_id: knowledge.goalId,
    source_attempt_id: knowledge.sourceAttemptId,
    context: knowledge.context,
    observation: knowledge.observation,
    hypothesis: knowledge.hypothesis,
    implication: knowledge.implication,
    related_strategy_tags: knowledge.relatedStrategyTags,
    created_at: knowledge.createdAt,
  };
}

export function promotionToSnakeCase(promotion: KnowledgePromotion) {
  return {
    id: promotion.id,
    knowledge_id: promotion.knowledgeId,
    visibility: promotion.visibility,
    agent_id: promotion.agentId,
    subject: promotion.subject,
    condition: promotion.condition,
    summary: promotion.summary,
    recommendation: promotion.recommendation,
    confidence: promotion.confidence,
    support_count: promotion.supportCount,
    created_at: promotion.createdAt,
    updated_at: promotion.updatedAt,
  };
}
