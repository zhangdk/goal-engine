import { Hono } from 'hono';
import type { PolicyRepo } from '../repos/policy.repo.js';
import type { GoalRepo } from '../repos/goal.repo.js';
import { resolveAgentContext } from '../agent-context.js';

export function policiesRouter(goalRepo: GoalRepo, policyRepo: PolicyRepo): Hono {
  const router = new Hono();

  router.get('/current', (c) => {
    const { agentId } = resolveAgentContext(c.req.raw.headers);
    const goalId = c.req.query('goal_id');
    if (!goalId) {
      return c.json({ error: { code: 'validation_error', message: 'goal_id is required' } }, 422);
    }

    const goal = goalRepo.getById(agentId, goalId);
    if (!goal) {
      return c.json({ error: { code: 'not_found', message: 'Goal not found' } }, 404);
    }

    const policy = policyRepo.getByGoal(agentId, goalId);
    if (!policy) {
      return c.json({ error: { code: 'no_policy_yet', message: 'No policy exists for this goal yet' } }, 404);
    }

    return c.json({
      data: {
        id: policy.id,
        agent_id: policy.agentId,
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
