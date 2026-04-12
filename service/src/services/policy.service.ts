/**
 * PolicyService — reflection 写入 + policy upsert 管道
 *
 * 数据流（必须在单个 SQLite 事务内完成）：
 *
 *   POST /api/v1/reflections
 *         │
 *         ▼
 *   INSERT reflections          ◄── 失败则整体回滚
 *         │
 *         ▼
 *   UPSERT policies             ◄── 合并 avoid_strategies（幂等去重）
 *         │                        更新 preferred_next_step
 *         ▼                        保证 must_check_before_retry 非空
 *   return { reflection, policy }
 *
 * 规则：
 * - avoid_strategies 去重合并，不产生重复标签
 * - preferred_next_step 取最新 reflection 的 mustChange
 * - must_check_before_retry 若当前为空，给出默认最小值
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type { Reflection, Policy, Knowledge } from '../../../shared/types.js';
import type { GoalRepo } from '../repos/goal.repo.js';
import type { AttemptRepo } from '../repos/attempt.repo.js';
import type { ReflectionRepo } from '../repos/reflection.repo.js';
import type { PolicyRepo } from '../repos/policy.repo.js';
import { DEFAULT_AGENT_ID } from '../agent-context.js';
import type { KnowledgeService } from './knowledge.service.js';

export type WriteReflectionInput = {
  reflectionId?: string;
  agentId?: string;
  goalId: string;
  attemptId: string;
  summary: string;
  rootCause: string;
  mustChange: string;
  avoidStrategy?: string;
  createdAt: string;
};

export type WriteReflectionResult = {
  reflection: Reflection;
  policy: Policy;
  knowledge?: Knowledge;
};

/** 默认最小重试前检查项。 */
const DEFAULT_MUST_CHECK: string[] = [
  '确认当前路径与上次失败路径不同',
  '确认已理解上次失败的根因',
];

export class PolicyService {
  constructor(
    private db: Database.Database,
    private goalRepo: GoalRepo,
    private attemptRepo: AttemptRepo,
    private reflectionRepo: ReflectionRepo,
    private policyRepo: PolicyRepo,
    private knowledgeService?: KnowledgeService
  ) {}

  /**
   * 在单个数据库事务中：
   * 1. 写入 reflection
   * 2. 幂等 upsert policy
   *
   * 任何一步失败则整体回滚。
   */
  writeReflectionAndUpdatePolicy(input: WriteReflectionInput): WriteReflectionResult {
    const reflectionId = input.reflectionId ?? randomUUID();
    const agentId = input.agentId ?? DEFAULT_AGENT_ID;
    const now = new Date().toISOString();

    let reflection!: Reflection;
    let policy!: Policy;
    let knowledge: Knowledge | undefined;

    const transaction = this.db.transaction(() => {
      // 1. 写入 reflection
      reflection = {
        id: reflectionId,
        agentId,
        goalId: input.goalId,
        attemptId: input.attemptId,
        summary: input.summary,
        rootCause: input.rootCause,
        mustChange: input.mustChange,
        avoidStrategy: input.avoidStrategy,
        createdAt: input.createdAt,
      };
      this.reflectionRepo.create(reflection);

      // 2. 读取当前 policy（如有），做幂等合并
      const existing = this.policyRepo.getByGoal(agentId, input.goalId);

      const existingAvoid: string[] = existing?.avoidStrategies ?? [];
      const existingMustCheck: string[] = existing?.mustCheckBeforeRetry ?? [];

      // 幂等合并：去重追加新 avoidStrategy
      const mergedAvoid = input.avoidStrategy
        ? [...new Set([...existingAvoid, input.avoidStrategy])]
        : existingAvoid;

      // must_check_before_retry：保留已有项，若为空则给出默认值
      const mergedMustCheck =
        existingMustCheck.length > 0 ? existingMustCheck : [...DEFAULT_MUST_CHECK];

      policy = {
        id: existing?.id ?? randomUUID(),
        agentId,
        goalId: input.goalId,
        preferredNextStep: input.mustChange || existing?.preferredNextStep,
        avoidStrategies: mergedAvoid,
        mustCheckBeforeRetry: mergedMustCheck,
        updatedAt: now,
      };

      this.policyRepo.upsert(policy);

      const attempt = this.attemptRepo.getById(agentId, input.attemptId);
      if (this.knowledgeService && attempt) {
        knowledge = this.knowledgeService.createFromReflection({
          agentId,
          goalId: input.goalId,
          attemptId: input.attemptId,
          stage: attempt.stage,
          actionTaken: attempt.actionTaken,
          strategyTags: attempt.strategyTags,
          summary: input.summary,
          rootCause: input.rootCause,
          mustChange: input.mustChange,
          createdAt: input.createdAt,
        });
      }
    });

    transaction();

    return { reflection, policy, knowledge };
  }
}
