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

import type { RecoveryPacket } from '../../../shared/types.js';
import type { GoalRepo } from '../repos/goal.repo.js';
import type { AttemptRepo } from '../repos/attempt.repo.js';
import type { PolicyRepo } from '../repos/policy.repo.js';

export class RecoveryService {
  constructor(
    private goalRepo: GoalRepo,
    private attemptRepo: AttemptRepo,
    private policyRepo: PolicyRepo
  ) {}

  /**
   * 从事实源派生 RecoveryPacket。
   * 若 goal 不存在则返回 null。
   */
  build(goalId: string): RecoveryPacket | null {
    const goal = this.goalRepo.getById(goalId);
    if (!goal) return null;

    const policy = this.policyRepo.getByGoal(goalId);
    const latestProgress = this.attemptRepo.getLatestMeaningfulProgress(goalId);
    const latestFailure = this.attemptRepo.getLatestFailure(goalId);

    return {
      goalId: goal.id,
      goalTitle: goal.title,
      currentStage: goal.currentStage,
      successCriteria: goal.successCriteria,
      lastMeaningfulProgress: latestProgress?.actionTaken,
      lastFailureSummary: latestFailure?.actionTaken,
      avoidStrategies: policy?.avoidStrategies ?? [],
      preferredNextStep: policy?.preferredNextStep,
      generatedAt: new Date().toISOString(),
    };
  }
}
