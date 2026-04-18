import { Hono } from 'hono';
import { randomUUID } from 'node:crypto';
import type { RecoveryService } from '../services/recovery.service.js';
import type { RecoveryEventRepo } from '../repos/recovery-event.repo.js';
import type { KnowledgeReferenceEventRepo } from '../repos/knowledge-reference-event.repo.js';
import type { GoalAgentHistoryService } from '../services/goal-agent-history.service.js';
import type { GoalCompletion, GoalContract, RecoveryPacketCurrentPolicy, RecoveryPacketRecentAttempt } from '../../../shared/types.js';
import { knowledgeToSnakeCase, promotionToSnakeCase } from './knowledge.js';
import { resolveAgentContext } from '../agent-context.js';

export function recoveryRouter(
  recoveryService: RecoveryService,
  recoveryEventRepo: RecoveryEventRepo,
  knowledgeReferenceEventRepo: KnowledgeReferenceEventRepo,
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
      knowledgeReferenceEventRepo.create({
        id: randomUUID(),
        agentId,
        goalId: packet.goalId,
        knowledgeIds: packet.relevantKnowledge.map((knowledge) => knowledge.id),
        promotionIds: packet.sharedWisdom.map((promotion) => promotion.id),
        decisionSurface: 'recovery_packet',
        createdAt: packet.generatedAt,
      });
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
        contract: packet.contract ? contractToSnakeCase(packet.contract) : undefined,
        completion: packet.completion ? completionToSnakeCase(packet.completion) : undefined,
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

function contractToSnakeCase(contract: GoalContract) {
  return {
    id: contract.id,
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

function completionToSnakeCase(completion: GoalCompletion) {
  return {
    id: completion.id,
    evidence_ids: completion.evidenceIds,
    summary: completion.summary,
    completed_at: completion.completedAt,
  };
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
