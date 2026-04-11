import { Hono } from 'hono';
import type { PolicyRepo } from '../repos/policy.repo.js';

export function policiesRouter(policyRepo: PolicyRepo): Hono {
  const router = new Hono();

  router.get('/current', (c) => {
    const goalId = c.req.query('goal_id');
    if (!goalId) {
      return c.json({ error: { code: 'validation_error', message: 'goal_id is required' } }, 422);
    }

    const policy = policyRepo.getByGoal(goalId);
    if (!policy) {
      return c.json({ error: { code: 'no_policy_yet', message: 'No policy exists for this goal yet' } }, 404);
    }

    return c.json({
      data: {
        id: policy.id,
        goal_id: policy.goalId,
        preferred_next_step: policy.preferredNextStep,
        avoid_strategies: policy.avoidStrategies,
        must_check_before_retry: policy.mustCheckBeforeRetry,
        updated_at: policy.updatedAt,
      },
    });
  });

  return router;
}
