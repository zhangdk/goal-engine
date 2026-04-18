import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { AttemptEvidence, GoalCompletion, GoalContract } from '../../../shared/types.js';
import type { GoalRepo } from '../repos/goal.repo.js';
import type { GoalAgentAssignmentRepo } from '../repos/goal-agent-assignment.repo.js';
import type { GoalContractRepo } from '../repos/goal-contract.repo.js';
import type { AttemptEvidenceRepo } from '../repos/attempt-evidence.repo.js';
import type { GoalCompletionRepo } from '../repos/goal-completion.repo.js';
import type { GoalAgentHistoryService } from '../services/goal-agent-history.service.js';
import { resolveAgentContext } from '../agent-context.js';

const goalContractInputSchema = z.object({
  outcome: z.string().min(1),
  success_evidence: z.array(z.string().min(1)).default([]),
  deadline_at: z.string().datetime().optional(),
  autonomy_level: z.union([
    z.literal(0),
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
  ]).default(1),
  boundary_rules: z.array(z.string()).default([]),
  stop_conditions: z.array(z.string()).default([]),
  strategy_guidance: z.array(z.string()).default([]),
  permission_boundary: z.array(z.string()).default([]),
});

const createGoalSchema = z.object({
  title: z.string().min(1),
  success_criteria: z.array(z.string().min(1)).min(1),
  stop_conditions: z.array(z.string()).default([]),
  current_stage: z.string().default('initial'),
  priority: z.number().int().default(1),
  replace_active: z.boolean().default(false),
  contract: goalContractInputSchema.optional(),
});

const patchGoalSchema = z.object({
  status: z.enum(['active', 'blocked', 'completed', 'abandoned']).optional(),
  current_stage: z.string().optional(),
  priority: z.number().int().optional(),
  success_criteria: z.array(z.string().min(1)).min(1).optional(),
  stop_conditions: z.array(z.string()).optional(),
});

const completeGoalSchema = z.object({
  evidence_ids: z.array(z.string().min(1)).min(1),
  summary: z.string().min(1),
});

export function goalsRouter(
  db: Database.Database,
  goalRepo: GoalRepo,
  goalAgentAssignmentRepo: GoalAgentAssignmentRepo,
  goalAgentHistoryService: GoalAgentHistoryService,
  goalContractRepo: GoalContractRepo,
  attemptEvidenceRepo: AttemptEvidenceRepo,
  goalCompletionRepo: GoalCompletionRepo
): Hono {
  const router = new Hono();

  router.post('/', zValidator('json', createGoalSchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: { code: 'validation_error', details: result.error.issues } }, 422);
    }
  }), (c) => {
    const { agentId } = resolveAgentContext(c.req.raw.headers);
    const data = c.req.valid('json');
    const now = new Date().toISOString();
    const id = randomUUID();
    const existingActiveGoal = goalRepo.getCurrent(agentId);

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

    let createdContract: GoalContract | null = null;
    try {
      const createGoalWithContract = db.transaction(() => {
        if (existingActiveGoal && data.replace_active) {
          goalRepo.patch(agentId, existingActiveGoal.id, {
            status: 'abandoned',
            updatedAt: now,
          });
        }

        goalRepo.create({
          id,
          agentId,
          title: data.title,
          status: 'active',
          successCriteria: data.success_criteria,
          stopConditions: data.stop_conditions,
          priority: data.priority,
          currentStage: data.current_stage,
          createdAt: now,
          updatedAt: now,
        });

        if (data.contract) {
          goalContractRepo.create({
            id: randomUUID(),
            agentId,
            goalId: id,
            outcome: data.contract.outcome,
            successEvidence: data.contract.success_evidence,
            deadlineAt: data.contract.deadline_at,
            autonomyLevel: data.contract.autonomy_level,
            boundaryRules: data.contract.boundary_rules,
            stopConditions: data.contract.stop_conditions,
            strategyGuidance: data.contract.strategy_guidance,
            permissionBoundary: data.contract.permission_boundary,
            createdAt: now,
            updatedAt: now,
          });
          createdContract = goalContractRepo.getByGoal(agentId, id);
        }
      });

      createGoalWithContract();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('UNIQUE') || msg.includes('unique')) {
        const activeGoal = goalRepo.getCurrent(agentId);
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

    const goal = goalRepo.getById(agentId, id)!;
    goalAgentHistoryService.recordGoalStart(goal.id, goal.createdAt, agentId);
    return c.json({
      data: {
        ...toSnakeCase(goal),
        contract: createdContract ? contractToSnakeCase(createdContract) : undefined,
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
    const { agentId } = resolveAgentContext(c.req.raw.headers);
    const goal = goalRepo.getCurrent(agentId);
    if (!goal) {
      return c.json({ error: { code: 'no_active_goal', message: 'No active goal found' } }, 404);
    }
    return c.json({ data: toSnakeCase(goal) });
  });

  router.get('/:goalId/contract', (c) => {
    const goalId = c.req.param('goalId');
    const { agentId } = resolveAgentContext(c.req.raw.headers);
    const goal = goalRepo.getById(agentId, goalId);
    if (!goal) {
      return c.json({ error: { code: 'not_found', message: 'Goal not found' } }, 404);
    }
    const contract = goalContractRepo.getByGoal(agentId, goalId);
    if (!contract) {
      return c.json({ error: { code: 'not_found', message: 'Goal contract not found' } }, 404);
    }
    return c.json({ data: contractToSnakeCase(contract) });
  });

  router.post('/:goalId/complete', zValidator('json', completeGoalSchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: { code: 'validation_error', details: result.error.issues } }, 422);
    }
  }), (c) => {
    const goalId = c.req.param('goalId');
    const { agentId } = resolveAgentContext(c.req.raw.headers);
    const data = c.req.valid('json');
    const goal = goalRepo.getById(agentId, goalId);
    if (!goal) {
      return c.json({ error: { code: 'not_found', message: 'Goal not found' } }, 404);
    }

    const uniqueEvidenceIds = new Set(data.evidence_ids);
    if (uniqueEvidenceIds.size !== data.evidence_ids.length) {
      return c.json({
        error: {
          code: 'validation_error',
          message: 'completion evidence_ids must be unique',
        },
      }, 422);
    }

    const existingCompletion = goalCompletionRepo.getByGoal(agentId, goalId);
    if (existingCompletion || goal.status === 'completed') {
      return c.json({
        error: {
          code: 'state_conflict',
          message: 'Goal is already completed',
        },
      }, 409);
    }

    const evidence = attemptEvidenceRepo.listByIds(agentId, goalId, data.evidence_ids);
    if (evidence.length !== uniqueEvidenceIds.size) {
      return c.json({
        error: {
          code: 'insufficient_evidence',
          message: 'All completion evidence_ids must belong to the goal and requesting agent',
        },
      }, 422);
    }

    const inadmissible = evidence.find((item) => item.kind === 'blocker');
    if (inadmissible) {
      return c.json({
        error: {
          code: 'inadmissible_evidence',
          message: 'Blocker evidence cannot be used as completion proof',
        },
      }, 422);
    }

    const now = new Date().toISOString();
    const completion: GoalCompletion = {
      id: randomUUID(),
      agentId,
      goalId,
      evidenceIds: data.evidence_ids,
      summary: data.summary,
      completedAt: now,
    };

    try {
      const completeGoal = db.transaction(() => {
        goalCompletionRepo.create(completion);
        goalRepo.patch(agentId, goalId, {
          status: 'completed',
          updatedAt: now,
        });
        goalAgentHistoryService.touchGoal(goalId, 'goal_completed', now, agentId);
      });
      completeGoal();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return c.json({ error: { code: 'internal_error', message: msg } }, 500);
    }

    const updated = goalRepo.getById(agentId, goalId)!;
    return c.json({
      data: {
        goal: toSnakeCase(updated),
        completion: completionToSnakeCase(completion),
        evidence: evidence.map(evidenceToSnakeCase),
      },
    });
  });

  router.patch('/:goalId', zValidator('json', patchGoalSchema, (result, c) => {
    if (!result.success) {
      return c.json({ error: { code: 'validation_error', details: result.error.issues } }, 422);
    }
  }), (c) => {
    const goalId = c.req.param('goalId');
    const { agentId } = resolveAgentContext(c.req.raw.headers);
    const data = c.req.valid('json');
    const now = new Date().toISOString();

    const existing = goalRepo.getById(agentId, goalId);
    if (!existing) {
      return c.json({ error: { code: 'not_found', message: 'Goal not found' } }, 404);
    }

    goalRepo.patch(agentId, goalId, {
      status: data.status,
      currentStage: data.current_stage,
      priority: data.priority,
      successCriteria: data.success_criteria,
      stopConditions: data.stop_conditions,
      updatedAt: now,
    });

    const updated = goalRepo.getById(agentId, goalId)!;
    return c.json({ data: toSnakeCase(updated) });
  });

  router.get('/:goalId/agents', (c) => {
    const goalId = c.req.param('goalId');
    const { agentId } = resolveAgentContext(c.req.raw.headers);
    const goal = goalRepo.getById(agentId, goalId);
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

function completionToSnakeCase(completion: GoalCompletion) {
  return {
    id: completion.id,
    agent_id: completion.agentId,
    goal_id: completion.goalId,
    evidence_ids: completion.evidenceIds,
    summary: completion.summary,
    completed_at: completion.completedAt,
  };
}

function evidenceToSnakeCase(evidence: AttemptEvidence) {
  return {
    id: evidence.id,
    agent_id: evidence.agentId,
    goal_id: evidence.goalId,
    attempt_id: evidence.attemptId,
    kind: evidence.kind,
    summary: evidence.summary,
    uri: evidence.uri,
    file_path: evidence.filePath,
    tool_name: evidence.toolName,
    observed_at: evidence.observedAt,
    verifier: evidence.verifier,
    confidence: evidence.confidence,
    created_at: evidence.createdAt,
  };
}

function contractToSnakeCase(contract: GoalContract) {
  return {
    id: contract.id,
    agent_id: contract.agentId,
    goal_id: contract.goalId,
    outcome: contract.outcome,
    success_evidence: contract.successEvidence,
    deadline_at: contract.deadlineAt,
    autonomy_level: contract.autonomyLevel,
    boundary_rules: contract.boundaryRules,
    stop_conditions: contract.stopConditions,
    strategy_guidance: contract.strategyGuidance,
    permission_boundary: contract.permissionBoundary,
    created_at: contract.createdAt,
    updated_at: contract.updatedAt,
  };
}

function toSnakeCase(goal: {
  id: string;
  agentId: string;
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
    agent_id: goal.agentId,
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
