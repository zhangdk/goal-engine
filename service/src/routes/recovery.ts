import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import type { RecoveryService } from '../services/recovery.service.js';
import type { RecoveryEventRepo } from '../repos/recovery-event.repo.js';
import type { GoalAgentHistoryService } from '../services/goal-agent-history.service.js';
import type { RecoveryPacketCurrentPolicy, RecoveryPacketRecentAttempt } from '../../../shared/types.js';
import { knowledgeToSnakeCase, promotionToSnakeCase } from './knowledge.js';
import { resolveAgentContext } from '../agent-context.js';

export function recoveryRouter(
  recoveryService: RecoveryService,
  recoveryEventRepo: RecoveryEventRepo,
  goalAgentHistoryService: GoalAgentHistoryService
): Hono {
  const router = new Hono();

  router.get('/', (c) => {
    const { agentId } = resolveAgentContext(c.req.raw.headers);
    const goalId = c.req.query('goal_id');
    const source = c.req.query('source') === 'projection' ? 'projection' : 'service';
    if (!goalId) {
      return c.json({ error: { code: 'validation_error', message: 'goal_id is required' } }, 422);
    }

    const packet = recoveryService.build(agentId, goalId);
    if (!packet) {
      return c.json({ error: { code: 'not_found', message: 'Goal not found' } }, 404);
    }

    try {
      recoveryEventRepo.create({
        id: randomUUID(),
        agentId,
        goalId: packet.goalId,
        goalTitle: packet.goalTitle,
        currentStage: packet.currentStage,
        summary: `已恢复 ${packet.goalTitle}`,
        source,
        createdAt: packet.generatedAt,
      });
      goalAgentHistoryService.touchGoal(packet.goalId, 'recovery', packet.generatedAt, agentId);
    } catch {
      // Side effects (event logging, history touch) should not block recovery packet delivery
    }

    return c.json({
      data: {
        goal_id: packet.goalId,
        agent_id: packet.agentId,
        goal_title: packet.goalTitle,
        current_stage: packet.currentStage,
        success_criteria: packet.successCriteria,
        last_meaningful_progress: packet.lastMeaningfulProgress,
        last_failure_summary: packet.lastFailureSummary,
        avoid_strategies: packet.avoidStrategies,
        preferred_next_step: packet.preferredNextStep,
        current_policy: packet.currentPolicy ? policyToSnakeCase(packet.currentPolicy) : undefined,
        recent_attempts: packet.recentAttempts.map(attemptToSnakeCase),
        relevant_knowledge: packet.relevantKnowledge.map(knowledgeToSnakeCase),
        shared_wisdom: packet.sharedWisdom.map(promotionToSnakeCase),
        open_questions: packet.openQuestions,
        generated_at: packet.generatedAt,
      },
    });
  });

  return router;
}

function policyToSnakeCase(policy: RecoveryPacketCurrentPolicy) {
  return {
    preferred_next_step: policy.preferredNextStep,
    must_check_before_retry: policy.mustCheckBeforeRetry,
  };
}

function attemptToSnakeCase(attempt: RecoveryPacketRecentAttempt) {
  return {
    id: attempt.id,
    stage: attempt.stage,
    action_taken: attempt.actionTaken,
    result: attempt.result,
    failure_type: attempt.failureType,
    created_at: attempt.createdAt,
  };
}
