/**
 * Projection 一致性测试
 *
 * 验证 test-strategy 8.1-8.3：
 * 8.1 — policy 更新后，projection 内容同步更新
 * 8.2 — 新 session 能通过 recovery_packet + policy 重建投影
 * 8.3 — projection 不包含完整历史（attempts / reflections / policy history）
 */

import { describe, it, expect } from 'vitest';
import { writeProjections, type ProjectionInput } from '../../examples/workspace/goal-engine/projection-writer.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectionDir = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../examples/workspace/goal-engine'
);

function readProjection(filename: string): string {
  return readFileSync(join(projectionDir, filename), 'utf-8');
}

describe('Projection consistency (test-strategy 8.x)', () => {
  it('8.1 — projection reflects updated policy after policy change', () => {
    const input1: ProjectionInput = {
      recoveryPacket: {
        agentId: 'goal-engine-demo',
        goalId: 'goal_1',
        goalTitle: '目标',
        currentStage: 'research',
        successCriteria: ['条件A'],
        lastMeaningfulProgress: undefined,
        lastFailureSummary: '搜索失败',
        avoidStrategies: ['broad-web-search'],
        preferredNextStep: '用官方文档',
        recentAttempts: [],
        relevantKnowledge: [],
        sharedWisdom: [],
        openQuestions: [],
        generatedAt: '2026-04-03T08:00:00.000Z',
      },
      policy: {
        id: 'pol_1',
        agentId: 'goal-engine-demo',
        goalId: 'goal_1',
        preferredNextStep: '用官方文档',
        avoidStrategies: ['broad-web-search'],
        mustCheckBeforeRetry: ['确认阶段'],
        updatedAt: '2026-04-03T08:00:00.000Z',
      },
    };

    writeProjections(input1);
    const policy1 = readProjection('current-policy.md');
    expect(policy1).toContain('broad-web-search');
    expect(policy1).toContain('用官方文档');

    // 模拟 policy 更新
    const input2: ProjectionInput = {
      recoveryPacket: {
        ...input1.recoveryPacket,
        avoidStrategies: ['broad-web-search', 'shallow-crawl'],
        preferredNextStep: '用学术数据库',
        generatedAt: '2026-04-03T09:00:00.000Z',
      },
      policy: {
        ...input1.policy!,
        avoidStrategies: ['broad-web-search', 'shallow-crawl'],
        preferredNextStep: '用学术数据库',
        updatedAt: '2026-04-03T09:00:00.000Z',
      },
    };

    writeProjections(input2);
    const policy2 = readProjection('current-policy.md');
    expect(policy2).toContain('shallow-crawl');
    expect(policy2).toContain('用学术数据库');
  });

  it('8.2 — new session can rebuild projection from recovery_packet + policy', () => {
    const input: ProjectionInput = {
      recoveryPacket: {
        agentId: 'goal-engine-demo',
        goalId: 'goal_1',
        goalTitle: '编写供应商对比',
        currentStage: 'research',
        successCriteria: ['至少10个供应商', '输出为 markdown'],
        lastMeaningfulProgress: '已识别 3 个目标供应商',
        lastFailureSummary: '宽泛搜索信噪比太低',
        avoidStrategies: ['broad-web-search'],
        preferredNextStep: '只比较 3 个官方文档',
        recentAttempts: [],
        relevantKnowledge: [],
        sharedWisdom: [],
        openQuestions: [],
        generatedAt: '2026-04-03T08:15:00.000Z',
      },
      policy: {
        id: 'pol_1',
        agentId: 'goal-engine-demo',
        goalId: 'goal_1',
        preferredNextStep: '只比较 3 个官方文档',
        avoidStrategies: ['broad-web-search'],
        mustCheckBeforeRetry: ['确认当前阶段', '使用更窄的供应商集'],
        updatedAt: '2026-04-03T08:12:00.000Z',
      },
    };

    writeProjections(input);

    // 验证所有三个文件都有内容
    const goal = readProjection('current-goal.md');
    expect(goal).toContain('编写供应商对比');
    expect(goal).toContain('research');
    expect(goal).toContain('至少10个供应商');
    expect(goal).toContain('已识别 3 个目标供应商');

    const policy = readProjection('current-policy.md');
    expect(policy).toContain('broad-web-search');
    expect(policy).toContain('只比较 3 个官方文档');
    expect(policy).toContain('确认当前阶段');

    const recovery = readProjection('recovery-packet.md');
    expect(recovery).toContain('goal_1');
    expect(recovery).toContain('编写供应商对比');
    expect(recovery).toContain('broad-web-search');
  });

  it('8.3 — projection never stores full history', () => {
    const input: ProjectionInput = {
      recoveryPacket: {
        agentId: 'goal-engine-demo',
        goalId: 'goal_1',
        goalTitle: '目标',
        currentStage: 'init',
        successCriteria: ['条件'],
        lastMeaningfulProgress: '进展',
        lastFailureSummary: '失败摘要',
        avoidStrategies: ['策略A'],
        preferredNextStep: '下一步',
        recentAttempts: [],
        relevantKnowledge: [],
        sharedWisdom: [],
        openQuestions: [],
        generatedAt: '2026-04-03T08:00:00.000Z',
      },
      policy: {
        id: 'pol_1',
        agentId: 'goal-engine-demo',
        goalId: 'goal_1',
        preferredNextStep: '下一步',
        avoidStrategies: ['策略A'],
        mustCheckBeforeRetry: ['检查'],
        updatedAt: '2026-04-03T08:00:00.000Z',
      },
    };

    writeProjections(input);

    // 检查所有 projection 文件都不包含完整历史关键词
    const files = ['current-goal.md', 'current-policy.md', 'recovery-packet.md'];
    for (const file of files) {
      const content = readProjection(file);
      // 不应包含 attempt 列表、reflection 列表、policy 历史
      expect(content).not.toMatch(/attempt_\w{8}/); // attempt IDs
      expect(content).not.toMatch(/reflection_\w{8}/); // reflection IDs
      expect(content).not.toContain('## 全部 Attempts');
      expect(content).not.toContain('## 全部 Reflections');
      expect(content).not.toContain('## Policy 历史');
    }
  });
});
