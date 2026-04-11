import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { GoalRepo } from '../repos/goal.repo.js';
import type { GoalAgentAssignmentRepo } from '../repos/goal-agent-assignment.repo.js';
import type { GoalAgentHistoryService } from '../services/goal-agent-history.service.js';

const createGoalSchema = z.object({
  title: z.string().min(1),
  success_criteria: z.array(z.string().min(1)).min(1),
  stop_conditions: z.array(z.string()).default([]),
  current_stage: z.string().default('initial'),
  priority: z.number().int().default(1),
  replace_active: z.boolean().default(false),
});

const patchGoalSchema = z.object({
  status: z.enum(['active', 'blocked', 'completed', 'abandoned']).optional(),
  current_stage: z.string().optional(),
  priority: z.number().int().optional(),
  success_criteria: z.array(z.string().min(1)).min(1).optional(),
  stop_conditions: z.array(z.string()).optional(),
});

export function goalsRouter(goalRepo: GoalRepo, goalAgentAssignmentRepo: GoalAgentAssignmentRepo, goalAgentHistoryService: GoalAgentHistoryService): Hono {
  const router = new Hono();

  router.post('/', zValidator('json', createGoalSchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: { code: 'validation_error', details: result.error.issues } }, 422);
    }
  }), (c) => {
    const data = c.req.valid('json');
    const now = new Date().toISOString();
    const id = randomUUID();
    const existingActiveGoal = goalRepo.getCurrent();

    if (existingActiveGoal && !data.replace_active) {
      return c.json({
        error: {
          code: 'state_conflict',
          message: 'An active goal already exists',
          active_goal: {
            id: existingActiveGoal.id,
            title: existingActiveGoal.title,
            current_stage: existingActiveGoal.currentStage,
            updated_at: existingActiveGoal.updatedAt,
          },
        },
      }, 409);
    }

    if (existingActiveGoal && data.replace_active) {
      goalRepo.patch(existingActiveGoal.id, {
        status: 'abandoned',
        updatedAt: now,
      });
    }

    try {
      goalRepo.create({
        id,
        title: data.title,
        status: 'active',
        successCriteria: data.success_criteria,
        stopConditions: data.stop_conditions,
        priority: data.priority,
        currentStage: data.current_stage,
        createdAt: now,
        updatedAt: now,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('UNIQUE') || msg.includes('unique')) {
        const activeGoal = goalRepo.getCurrent();
        return c.json({
          error: {
            code: 'state_conflict',
            message: 'An active goal already exists',
            ...(activeGoal
              ? {
                  active_goal: {
                    id: activeGoal.id,
                    title: activeGoal.title,
                    current_stage: activeGoal.currentStage,
                    updated_at: activeGoal.updatedAt,
                  },
                }
              : {}),
          },
        }, 409);
      }
      return c.json({ error: { code: 'internal_error', message: msg } }, 500);
    }

    const goal = goalRepo.getById(id)!;
    goalAgentHistoryService.recordGoalStart(goal.id, goal.createdAt);
    return c.json({
      data: {
        ...toSnakeCase(goal),
        ...(existingActiveGoal && data.replace_active
          ? {
              replaced_goal: {
                id: existingActiveGoal.id,
                title: existingActiveGoal.title,
                status: 'abandoned',
              },
            }
          : {}),
      },
    }, 201);
  });

  router.get('/current', (c) => {
    const goal = goalRepo.getCurrent();
    if (!goal) {
      return c.json({ error: { code: 'no_active_goal', message: 'No active goal found' } }, 404);
    }
    return c.json({ data: toSnakeCase(goal) });
  });

  router.patch('/:goalId', zValidator('json', patchGoalSchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: { code: 'validation_error', details: result.error.issues } }, 422);
    }
  }), (c) => {
    const goalId = c.req.param('goalId');
    const data = c.req.valid('json');
    const now = new Date().toISOString();

    const existing = goalRepo.getById(goalId);
    if (!existing) {
      return c.json({ error: { code: 'not_found', message: 'Goal not found' } }, 404);
    }

    goalRepo.patch(goalId, {
      status: data.status,
      currentStage: data.current_stage,
      priority: data.priority,
      successCriteria: data.success_criteria,
      stopConditions: data.stop_conditions,
      updatedAt: now,
    });

    const updated = goalRepo.getById(goalId)!;
    return c.json({ data: toSnakeCase(updated) });
  });

  router.get('/:goalId/agents', (c) => {
    const goalId = c.req.param('goalId');
    const goal = goalRepo.getById(goalId);
    if (!goal) {
      return c.json({ error: { code: 'not_found', message: 'Goal not found' } }, 404);
    }

    const assignments = goalAgentAssignmentRepo.listByGoal(goalId);
    return c.json({
      data: {
        assignments: assignments.map((a) => ({
          id: a.id,
          goal_id: a.goalId,
          agent_id: a.agentId,
          agent_name: a.agentName,
          workspace: a.workspace,
          session: a.session,
          assignment_reason: a.assignmentReason,
          assigned_at: a.assignedAt,
          released_at: a.releasedAt ?? null,
        })),
      },
    });
  });

  return router;
}

function toSnakeCase(goal: {
  id: string;
  title: string;
  status: string;
  successCriteria: string[];
  stopConditions: string[];
  priority: number;
  currentStage: string;
  createdAt: string;
  updatedAt: string;
}) {
  return {
    id: goal.id,
    title: goal.title,
    status: goal.status,
    success_criteria: goal.successCriteria,
    stop_conditions: goal.stopConditions,
    priority: goal.priority,
    current_stage: goal.currentStage,
    created_at: goal.createdAt,
    updated_at: goal.updatedAt,
  };
}
