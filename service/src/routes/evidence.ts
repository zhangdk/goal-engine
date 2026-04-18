import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import type { GoalRepo } from '../repos/goal.repo.js';
import type { AttemptRepo } from '../repos/attempt.repo.js';
import type { AttemptEvidenceRepo } from '../repos/attempt-evidence.repo.js';
import type { AttemptEvidence } from '../../../shared/types.js';
import { resolveAgentContext } from '../agent-context.js';

const evidenceSchema = z.object({
  goal_id: z.string().min(1),
  attempt_id: z.string().min(1).optional(),
  kind: z.enum(['artifact', 'external_fact', 'channel_check', 'permission_boundary', 'reply', 'payment', 'blocker']),
  summary: z.string().min(1),
  uri: z.string().url().optional(),
  file_path: z.string().optional(),
  tool_name: z.string().optional(),
  observed_at: z.string().datetime().optional(),
  verifier: z.enum(['agent', 'user', 'service', 'browser']).default('agent'),
  confidence: z.number().min(0).max(1).default(0.5),
});

export function evidenceRouter(
  goalRepo: GoalRepo,
  attemptRepo: AttemptRepo,
  attemptEvidenceRepo: AttemptEvidenceRepo
): Hono {
  const router = new Hono();

  router.post('/', zValidator('json', evidenceSchema, (result, c) => {
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

    if (data.attempt_id) {
      const attempt = attemptRepo.getById(agentId, data.attempt_id);
      if (!attempt || attempt.goalId !== data.goal_id) {
        return c.json({ error: { code: 'not_found', message: 'Attempt not found for this goal' } }, 404);
      }
    }

    const now = new Date().toISOString();
    const evidence: AttemptEvidence = {
      id: randomUUID(),
      agentId,
      goalId: data.goal_id,
      attemptId: data.attempt_id,
      kind: data.kind,
      summary: data.summary,
      uri: data.uri,
      filePath: data.file_path,
      toolName: data.tool_name,
      observedAt: data.observed_at ?? now,
      verifier: data.verifier,
      confidence: data.confidence,
      createdAt: now,
    };

    attemptEvidenceRepo.create(evidence);
    return c.json({ data: evidenceToSnakeCase(evidence) }, 201);
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

    const evidence = attemptEvidenceRepo.listByGoal(agentId, goalId, {
      attemptId: c.req.query('attempt_id') || undefined,
    });
    return c.json({ data: evidence.map(evidenceToSnakeCase) });
  });

  return router;
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
