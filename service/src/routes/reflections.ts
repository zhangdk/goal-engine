import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { PolicyService } from '../services/policy.service.js';
import type { AttemptRepo } from '../repos/attempt.repo.js';
import type { GoalAgentHistoryService } from '../services/goal-agent-history.service.js';

const createReflectionSchema = z.object({
  goal_id: z.string().min(1),
  attempt_id: z.string().min(1),
  summary: z.string().min(1),
  root_cause: z.string().min(1),
  must_change: z.string().min(1),
  avoid_strategy: z.string().optional(),
});

export function reflectionsRouter(
  policyService: PolicyService,
  attemptRepo: AttemptRepo,
  goalAgentHistoryService: GoalAgentHistoryService
): Hono {
  const router = new Hono();

  router.post('/', zValidator('json', createReflectionSchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: { code: 'validation_error', details: result.error.issues } }, 422);
    }
  }), (c) => {
    const data = c.req.valid('json');
    const now = new Date().toISOString();

    // Validate attempt exists and matches goal
    const attempt = attemptRepo.getById(data.attempt_id);
    if (!attempt) {
      return c.json({ error: { code: 'not_found', message: 'Attempt not found' } }, 404);
    }
    if (attempt.goalId !== data.goal_id) {
      return c.json({ error: { code: 'validation_error', message: 'Attempt does not belong to the specified goal' } }, 422);
    }
    if (attempt.result !== 'failure') {
      return c.json({ error: { code: 'validation_error', message: 'Reflection can only be created for failed attempts' } }, 422);
    }

    try {
      const result = policyService.writeReflectionAndUpdatePolicy({
        goalId: data.goal_id,
        attemptId: data.attempt_id,
        summary: data.summary,
        rootCause: data.root_cause,
        mustChange: data.must_change,
        avoidStrategy: data.avoid_strategy,
        createdAt: now,
      });

      goalAgentHistoryService.touchGoal(data.goal_id, 'reflection_recorded', now);

      return c.json({
        data: {
          reflection: reflectionToSnakeCase(result.reflection),
          policy: policyToSnakeCase(result.policy),
        },
      }, 201);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('UNIQUE') || msg.includes('unique')) {
        return c.json({ error: { code: 'duplicate_reflection', message: 'Reflection for this attempt already exists' } }, 409);
      }
      return c.json({ error: { code: 'internal_error', message: msg } }, 500);
    }
  });

  return router;
}

function reflectionToSnakeCase(r: {
  id: string;
  goalId: string;
  attemptId: string;
  summary: string;
  rootCause: string;
  mustChange: string;
  avoidStrategy?: string;
  createdAt: string;
}) {
  return {
    id: r.id,
    goal_id: r.goalId,
    attempt_id: r.attemptId,
    summary: r.summary,
    root_cause: r.rootCause,
    must_change: r.mustChange,
    avoid_strategy: r.avoidStrategy,
    created_at: r.createdAt,
  };
}

function policyToSnakeCase(p: {
  id: string;
  goalId: string;
  preferredNextStep?: string;
  avoidStrategies: string[];
  mustCheckBeforeRetry: string[];
  updatedAt: string;
}) {
  return {
    id: p.id,
    goal_id: p.goalId,
    preferred_next_step: p.preferredNextStep,
    avoid_strategies: p.avoidStrategies,
    must_check_before_retry: p.mustCheckBeforeRetry,
    updated_at: p.updatedAt,
  };
}
