import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { Experiment } from '../../../shared/types.js';
import type { ExperimentRepo } from '../repos/experiment.repo.js';
import type { GoalRepo } from '../repos/goal.repo.js';
import { resolveAgentContext } from '../agent-context.js';

const createExperimentSchema = z.object({
  goal_id: z.string().min(1),
  stage: z.string().min(1),
  hypothesis: z.string().min(1),
  action_plan: z.string().min(1),
  expected_signal: z.string().min(1),
  cost_level: z.enum(['low', 'medium', 'high']),
  boundary_level: z.enum(['safe', 'permission_required', 'blocked']),
  why_different: z.string().min(1),
  status: z.enum(['planned', 'active', 'completed', 'abandoned', 'blocked']),
});

const patchExperimentSchema = z.object({
  stage: z.string().min(1).optional(),
  action_plan: z.string().min(1).optional(),
  expected_signal: z.string().min(1).optional(),
  cost_level: z.enum(['low', 'medium', 'high']).optional(),
  boundary_level: z.enum(['safe', 'permission_required', 'blocked']).optional(),
  why_different: z.string().min(1).optional(),
  status: z.enum(['planned', 'active', 'completed', 'abandoned', 'blocked']).optional(),
});

export function experimentsRouter(goalRepo: GoalRepo, experimentRepo: ExperimentRepo): Hono {
  const router = new Hono();

  router.post('/experiments', zValidator('json', createExperimentSchema, (result, c) => {
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

    const now = new Date().toISOString();
    const experiment: Experiment = {
      id: randomUUID(),
      agentId,
      goalId: data.goal_id,
      stage: data.stage,
      hypothesis: data.hypothesis,
      actionPlan: data.action_plan,
      expectedSignal: data.expected_signal,
      costLevel: data.cost_level,
      boundaryLevel: data.boundary_level,
      whyDifferent: data.why_different,
      status: data.status,
      createdAt: now,
      updatedAt: now,
    };

    try {
      experimentRepo.create(experiment);
    } catch (err: unknown) {
      if (isSqliteUniqueError(err)) {
        return c.json({
          error: {
            code: 'active_experiment_conflict',
            message: 'An active experiment already exists for this goal',
          },
        }, 409);
      }
      return c.json({ error: { code: 'internal_error', message: 'Failed to create experiment' } }, 500);
    }

    return c.json({ data: experimentToSnakeCase(experiment) }, 201);
  });

  router.get('/experiments/:id', (c) => {
    const { agentId } = resolveAgentContext(c.req.raw.headers);
    const experiment = experimentRepo.getById(agentId, c.req.param('id'));
    if (!experiment) {
      return c.json({ error: { code: 'not_found', message: 'Experiment not found' } }, 404);
    }
    return c.json({ data: experimentToSnakeCase(experiment) });
  });

  router.get('/goals/:goalId/experiments', (c) => {
    const { agentId } = resolveAgentContext(c.req.raw.headers);
    const goalId = c.req.param('goalId');
    const goal = goalRepo.getById(agentId, goalId);
    if (!goal) {
      return c.json({ error: { code: 'not_found', message: 'Goal not found' } }, 404);
    }
    return c.json({ data: experimentRepo.listByGoal(agentId, goalId).map(experimentToSnakeCase) });
  });

  router.patch('/experiments/:id', zValidator('json', patchExperimentSchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: { code: 'validation_error', details: result.error.issues } }, 422);
    }
  }), (c) => {
    const { agentId } = resolveAgentContext(c.req.raw.headers);
    const data = c.req.valid('json');
    let experiment: Experiment | null;
    try {
      experiment = experimentRepo.update(agentId, c.req.param('id'), {
        stage: data.stage,
        actionPlan: data.action_plan,
        expectedSignal: data.expected_signal,
        costLevel: data.cost_level,
        boundaryLevel: data.boundary_level,
        whyDifferent: data.why_different,
        status: data.status,
      });
    } catch (err: unknown) {
      if (isSqliteUniqueError(err)) {
        return c.json({
          error: {
            code: 'active_experiment_conflict',
            message: 'An active experiment already exists for this goal',
          },
        }, 409);
      }
      return c.json({ error: { code: 'internal_error', message: 'Failed to update experiment' } }, 500);
    }
    if (!experiment) {
      return c.json({ error: { code: 'not_found', message: 'Experiment not found' } }, 404);
    }
    return c.json({ data: experimentToSnakeCase(experiment) });
  });

  return router;
}

function isSqliteUniqueError(err: unknown): boolean {
  return err instanceof Error && err.message.toLowerCase().includes('unique');
}

export function experimentToSnakeCase(experiment: Experiment) {
  return {
    id: experiment.id,
    agent_id: experiment.agentId,
    goal_id: experiment.goalId,
    stage: experiment.stage,
    hypothesis: experiment.hypothesis,
    action_plan: experiment.actionPlan,
    expected_signal: experiment.expectedSignal,
    cost_level: experiment.costLevel,
    boundary_level: experiment.boundaryLevel,
    why_different: experiment.whyDifferent,
    status: experiment.status,
    created_at: experiment.createdAt,
    updated_at: experiment.updatedAt,
  };
}
