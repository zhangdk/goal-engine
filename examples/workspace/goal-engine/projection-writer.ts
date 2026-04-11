/**
 * projection-writer — 本地 projection 刷新 helper
 *
 * 职责：
 * - 从 service 读取最新状态，写入本地 markdown 摘要文件
 * - 只写摘要，不写完整历史（attempts / reflections / policy history）
 *
 * 刷新时机：
 * 1. 新 session 开始前
 * 2. policy 更新后
 * 3. current_stage 变化后
 * 4. recovery packet 重新生成后
 *
 * 一致性要求：
 * - 内容必须来自 service 当前状态
 * - 不得手工演化为另一套真相
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { RecoveryPacket, Policy } from '../../../shared/types.js';

const defaultProjectionDir = resolve(process.cwd(), '..', 'examples', 'workspace', 'goal-engine');

export type ProjectionInput = {
  recoveryPacket: RecoveryPacket;
  policy: Policy | null;
  projectionDir?: string;
};

/**
 * 刷新所有本地 projection 文件。
 * 所有内容来源于 service 派生的 RecoveryPacket + Policy。
 */
export function writeProjections(input: ProjectionInput): void {
  const { recoveryPacket, policy, projectionDir = defaultProjectionDir } = input;

  mkdirSync(projectionDir, { recursive: true });
  writeCurrentGoal(recoveryPacket, projectionDir);
  writeCurrentPolicy(policy, recoveryPacket.goalId, projectionDir);
  writeRecoveryPacket(recoveryPacket, projectionDir);
}

function writeCurrentGoal(packet: RecoveryPacket, projectionDir: string): void {
  const content = `# Current Goal

> 注意：此文件由 projection-writer 自动生成，请勿手动修改。
> 来源：service /api/v1/recovery-packet
> 更新时间：${packet.generatedAt}

## 目标

${packet.goalTitle}

## 当前阶段

${packet.currentStage}

## 成功条件

${packet.successCriteria.map(c => `- ${c}`).join('\n') || '（暂无）'}

## 最近有效进展

${packet.lastMeaningfulProgress ?? '（暂无记录）'}

## 最近失败摘要

${packet.lastFailureSummary ?? '（暂无失败）'}
`;

  writeFileSync(join(projectionDir, 'current-goal.md'), content, 'utf-8');
}

function writeCurrentPolicy(policy: Policy | null, goalId: string, projectionDir: string): void {
  const content = policy
    ? `# Current Policy

> 注意：此文件由 projection-writer 自动生成，请勿手动修改。
> 来源：service /api/v1/policies/current
> Goal: ${goalId}
> 更新时间：${policy.updatedAt}

## 禁止重复的策略

${policy.avoidStrategies.map(s => `- \`${s}\``).join('\n') || '（暂无）'}

## 推荐下一步

${policy.preferredNextStep ?? '（暂无推荐）'}

## 重试前必须检查

${policy.mustCheckBeforeRetry.map(c => `- ${c}`).join('\n') || '（暂无）'}
`
    : `# Current Policy

> 注意：此文件由 projection-writer 自动生成，请勿手动修改。
> Goal: ${goalId}

（暂无策略）
`;

  writeFileSync(join(projectionDir, 'current-policy.md'), content, 'utf-8');
}

function writeRecoveryPacket(packet: RecoveryPacket, projectionDir: string): void {
  const content = `# Recovery Packet

> 注意：此文件由 projection-writer 自动生成，请勿手动修改。
> 来源：service /api/v1/recovery-packet
> 生成时间：${packet.generatedAt}

## 目标

Goal ID: ${packet.goalId}
标题: ${packet.goalTitle}
阶段: ${packet.currentStage}

## 成功条件

${packet.successCriteria.map(c => `- ${c}`).join('\n') || '（暂无）'}

## 禁止策略

${packet.avoidStrategies.map(s => `- \`${s}\``).join('\n') || '（暂无）'}

## 推荐下一步

${packet.preferredNextStep ?? '（暂无推荐）'}

## 最近有效进展

${packet.lastMeaningfulProgress ?? '（暂无）'}

## 最近失败摘要

${packet.lastFailureSummary ?? '（暂无）'}
`;

  writeFileSync(join(projectionDir, 'recovery-packet.md'), content, 'utf-8');
}
