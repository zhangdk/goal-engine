/**
 * RecoveryService — Recovery Packet 组装流
 *
 * 数据来源（派生视图，不做独立持久化）：
 *
 *   goals ──────────────────┐
 *   attempts (success/partial)──► last_meaningful_progress
 *   attempts (failure) ─────► last_failure_summary
 *   policies ───────────────┘
 *                            │
 *                            ▼
 *                      RecoveryPacket
 *
 * 规则：
 * - 每次调用都从事实源重建，不依赖 recovery_packets 表
 * - last_meaningful_progress = 最近 success/partial attempt 的 action_taken
 * - last_failure_summary = 最近 failure attempt 的 action_taken（无 reflection 时也可用）
 */

import type { Attempt, RecoveryPacket, RecoveryPacketRecentAttempt } from '../../../shared/types.js';
import type { GoalRepo } from '../repos/goal.repo.js';
import type { AttemptRepo } from '../repos/attempt.repo.js';
import type { PolicyRepo } from '../repos/policy.repo.js';
import { DEFAULT_AGENT_ID } from '../agent-context.js';
import type { KnowledgeService } from './knowledge.service.js';

export class RecoveryService {
  constructor(
    private goalRepo: GoalRepo,
    private attemptRepo: AttemptRepo,
    private policyRepo: PolicyRepo,
    private knowledgeService: KnowledgeService
  ) {}

  /**
   * 从事实源派生 RecoveryPacket。
   * 若 goal 不存在则返回 null。
   */
  build(goalId: string): RecoveryPacket | null;
  build(agentId: string, goalId: string): RecoveryPacket | null;
  build(first: string, second?: string): RecoveryPacket | null {
    const agentId = second ? first : DEFAULT_AGENT_ID;
    const goalId = second ?? first;
    const goal = this.goalRepo.getById(agentId, goalId);
    if (!goal) return null;

    const policy = this.policyRepo.getByGoal(agentId, goalId);
    const latestProgress = this.attemptRepo.getLatestMeaningfulProgress(agentId, goalId);
    const latestFailure = this.attemptRepo.getLatestFailure(agentId, goalId);
    const recentAttempts = this.attemptRepo.listByGoal(agentId, goalId, { limit: 5 });
    const knowledgeTags = latestFailure?.strategyTags ?? recentAttempts.flatMap((attempt) => attempt.strategyTags);
    const relevantKnowledge = this.knowledgeService.listRelevant(agentId, goalId, knowledgeTags, 10);
    const sharedWisdom = this.knowledgeService.listSharedWisdom(agentId, goalId, knowledgeTags, 10);

    // Auto-promote referenced knowledge to 'agent' visibility
    const referencedKnowledgeIds = new Set<string>();
    for (const k of relevantKnowledge) {
      if (!referencedKnowledgeIds.has(k.id)) {
        this.knowledgeService.recordReference(k.id, agentId);
        referencedKnowledgeIds.add(k.id);
      }
    }

    return {
      agentId,
      goalId: goal.id,
      goalTitle: goal.title,
      currentStage: goal.currentStage,
      successCriteria: goal.successCriteria,
      lastMeaningfulProgress: latestProgress?.actionTaken,
      lastFailureSummary: latestFailure?.actionTaken,
      avoidStrategies: policy?.avoidStrategies ?? [],
      preferredNextStep: policy?.preferredNextStep,
      recentAttempts: recentAttempts.map(attemptToRecentAttempt),
      currentPolicy: policy
        ? {
            preferredNextStep: policy.preferredNextStep,
            mustCheckBeforeRetry: policy.mustCheckBeforeRetry,
          }
        : undefined,
      relevantKnowledge,
      sharedWisdom,
      openQuestions: buildOpenQuestions(goal.currentStage, latestFailure, relevantKnowledge.length),
      generatedAt: new Date().toISOString(),
    };
  }
}

function attemptToRecentAttempt(attempt: Attempt): RecoveryPacketRecentAttempt {
  return {
    id: attempt.id,
    stage: attempt.stage,
    actionTaken: attempt.actionTaken,
    result: attempt.result,
    failureType: attempt.failureType,
    createdAt: attempt.createdAt,
  };
}

function buildOpenQuestions(
  currentStage: string,
  latestFailure: Attempt | null,
  relevantKnowledgeCount: number
): string[] {
  const questions = [`What evidence would show progress in ${currentStage}?`];
  if (latestFailure && relevantKnowledgeCount === 0) {
    questions.push('What did the latest failure teach that is not captured yet?');
  }
  return questions;
}
