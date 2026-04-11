import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { RetryGuardService } from '../services/retry-guard.service.js';
import type { GoalRepo } from '../repos/goal.repo.js';
import type { PolicyRepo } from '../repos/policy.repo.js';
import type { AttemptRepo } from '../repos/attempt.repo.js';
import type { RetryHistoryRepo } from '../repos/retry-history.repo.js';
import type { GoalAgentHistoryService } from '../services/goal-agent-history.service.js';
import { resolveAgentContext } from '../agent-context.js';

const checkSchema = z.object({
  goal_id: z.string().min(1),
  planned_action: z.string().min(1),
  what_changed: z.string().default(''),
  strategy_tags: z.array(z.string()).default([]),
  policy_acknowledged: z.boolean(),
});

export function retryGuardRouter(
  goalRepo: GoalRepo,
  policyRepo: PolicyRepo,
  attemptRepo: AttemptRepo,
  retryHistoryRepo: RetryHistoryRepo,
  goalAgentHistoryService: GoalAgentHistoryService
): Hono {
  const router = new Hono();
  const guardService = new RetryGuardService();

  router.post('/check', zValidator('json', checkSchema, (result, c) => {
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

    const policy = policyRepo.getByGoal(agentId, data.goal_id);
    if (!policy) {
      return c.json({
        error: {
          code: 'no_policy_yet',
          message: 'No policy exists for this goal yet',
        },
      }, 404);
    }

    const latestFailure = attemptRepo.getLatestFailure(agentId, data.goal_id);

    const result = guardService.check({
      policyAcknowledged: data.policy_acknowledged,
      strategyTags: data.strategy_tags,
      whatChanged: data.what_changed,
      policy,
      latestFailureAttempt: latestFailure,
    });

    retryHistoryRepo.create({
      id: randomUUID(),
      agentId,
      goalId: data.goal_id,
      plannedAction: data.planned_action,
      whatChanged: data.what_changed,
      strategyTags: data.strategy_tags,
      policyAcknowledged: data.policy_acknowledged,
      allowed: result.allowed,
      reason: result.reason,
      warnings: result.warnings,
      tagOverlapRate: result.tagOverlapRate,
      createdAt: new Date().toISOString(),
    });
    goalAgentHistoryService.touchGoal(data.goal_id, 'retry_checked', undefined, agentId);

    return c.json({
      data: {
        allowed: result.allowed,
        reason: result.reason,
        warnings: result.warnings,
        tag_overlap_rate: result.tagOverlapRate,
      },
    });
  });

  return router;
}
