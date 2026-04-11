import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import * as runtimeModule from '../../../shared/runtime.js';
import type { FailureType } from '../../../shared/types.js';
import type { AttemptRepo } from '../repos/attempt.repo.js';
import type { GoalRepo } from '../repos/goal.repo.js';
import type { GoalAgentHistoryService } from '../services/goal-agent-history.service.js';
import { resolveAgentContext } from '../agent-context.js';

const runtime = 'default' in runtimeModule ? runtimeModule.default : runtimeModule;
const { FAILURE_TYPES } = runtime;
const FAILURE_TYPE_ALIASES = {
  tool_unavailable: 'external_blocker',
} as const;

type AttemptFailureTypeInput = (typeof FAILURE_TYPES)[number] | keyof typeof FAILURE_TYPE_ALIASES;

const createAttemptSchema = z
  .object({
    goal_id: z.string().min(1),
    stage: z.string().min(1),
    action_taken: z.string().min(1),
    strategy_tags: z.array(z.string()),
    result: z.enum(['success', 'partial', 'failure']),
    failure_type: z.union([z.enum(FAILURE_TYPES), z.literal('tool_unavailable')]).optional(),
    confidence: z.number().min(0).max(1).optional(),
    next_hypothesis: z.string().optional(),
  })
  .refine(
    (data) => data.result !== 'failure' || data.failure_type !== undefined,
    { message: 'failure_type is required when result is failure', path: ['failure_type'] }
  );

export function attemptsRouter(
  goalRepo: GoalRepo,
  attemptRepo: AttemptRepo,
  goalAgentHistoryService: GoalAgentHistoryService
): Hono {
  const router = new Hono();

  router.post('/', zValidator('json', createAttemptSchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: { code: 'validation_error', details: result.error.issues } }, 422);
    }
  }), (c) => {
    const { agentId } = resolveAgentContext(c.req.raw.headers);
    const data = c.req.valid('json');
    const id = randomUUID();
    const now = new Date().toISOString();
    const failureType = normalizeFailureType(data.failure_type);

    try {
      attemptRepo.create({
        id,
        agentId,
        goalId: data.goal_id,
        stage: data.stage,
        actionTaken: data.action_taken,
        strategyTags: data.strategy_tags,
        result: data.result,
        failureType,
        confidence: data.confidence,
        nextHypothesis: data.next_hypothesis,
        createdAt: now,
      });
    } catch (err: unknown) {
      if (isSqliteForeignKeyError(err)) {
        return c.json({ error: { code: 'not_found', message: 'Goal not found' } }, 404);
      }

      return c.json({
        error: {
          code: 'internal_error',
          message: 'Failed to create attempt',
        },
      }, 500);
    }

    const attempt = attemptRepo.getById(agentId, id)!;
    goalAgentHistoryService.touchGoal(attempt.goalId, 'attempt_recorded', attempt.createdAt, agentId);
    return c.json({ data: toSnakeCase(attempt) }, 201);
  });

  router.get('/', (c) => {
    const { agentId } = resolveAgentContext(c.req.raw.headers);
    const goalId = c.req.query('goal_id');
    if (!goalId) {
      return c.json({ error: { code: 'validation_error', message: 'goal_id is required' } }, 422);
    }
    const limitRaw = c.req.query('limit');
    const limit = limitRaw ? Math.min(Math.max(parseInt(limitRaw, 10) || 20, 1), 100) : 20;
    const result = c.req.query('result');
    const stage = c.req.query('stage');

    const goal = goalRepo.getById(agentId, goalId);
    if (!goal) {
      return c.json({ error: { code: 'not_found', message: 'Goal not found' } }, 404);
    }

    const attempts = attemptRepo.listByGoal(agentId, goalId, { limit, result, stage });
    return c.json({ data: attempts.map(toSnakeCase), meta: { limit } });
  });

  return router;
}

function isSqliteForeignKeyError(err: unknown): boolean {
  return err instanceof Error && err.message.includes('FOREIGN KEY constraint failed');
}

function normalizeFailureType(input: AttemptFailureTypeInput | undefined): FailureType | undefined {
  if (!input) {
    return undefined;
  }

  if (input in FAILURE_TYPE_ALIASES) {
    return FAILURE_TYPE_ALIASES[input as keyof typeof FAILURE_TYPE_ALIASES] as FailureType;
  }

  return input as FailureType;
}

function toSnakeCase(attempt: {
  id: string;
  agentId: string;
  goalId: string;
  stage: string;
  actionTaken: string;
  strategyTags: string[];
  result: string;
  failureType?: string;
  confidence?: number;
  nextHypothesis?: string;
  createdAt: string;
}) {
  return {
    id: attempt.id,
    agent_id: attempt.agentId,
    goal_id: attempt.goalId,
    stage: attempt.stage,
    action_taken: attempt.actionTaken,
    strategy_tags: attempt.strategyTags,
    result: attempt.result,
    failure_type: attempt.failureType,
    confidence: attempt.confidence,
    next_hypothesis: attempt.nextHypothesis,
    created_at: attempt.createdAt,
  };
}
