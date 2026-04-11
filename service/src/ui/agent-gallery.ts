import type { GoalRepo } from '../repos/goal.repo.js';
import type { AttemptRepo } from '../repos/attempt.repo.js';
import type { ReflectionRepo } from '../repos/reflection.repo.js';
import type { PolicyRepo } from '../repos/policy.repo.js';
import type { RetryHistoryRepo } from '../repos/retry-history.repo.js';
import type { RecoveryEventRepo } from '../repos/recovery-event.repo.js';
import type { GoalAgentAssignmentRepo } from '../repos/goal-agent-assignment.repo.js';
import type { RecoveryService } from '../services/recovery.service.js';
import { buildAgentDetail } from './agent-detail.js';
import { listManagedOpenClawAgents } from './managed-openclaw-agents.js';

type AgentGalleryDependencies = {
  goalRepo: GoalRepo;
  attemptRepo: AttemptRepo;
  reflectionRepo: ReflectionRepo;
  policyRepo: PolicyRepo;
  retryHistoryRepo: RetryHistoryRepo;
  recoveryEventRepo: RecoveryEventRepo;
  goalAgentAssignmentRepo: GoalAgentAssignmentRepo;
  recoveryService: RecoveryService;
  workspaceStatePath?: string;
  runtimeStatePath?: string;
};

export function buildAgentGallery(deps: AgentGalleryDependencies): {
  agents: Array<{
    agentId: string;
    name: string;
    currentGoal: string;
    workspace: string;
    session: string;
    managed: boolean;
    learningVerdict: {
      level: 'none' | 'partial' | 'clear' | 'stalled';
      label: string;
      reason: string;
    };
    lastActiveAt: string;
    recentChangeSummary: string;
  }>;
} {
  const managedAgents = listManagedOpenClawAgents({
    workspaceStatePath: deps.workspaceStatePath,
    runtimeStatePath: deps.runtimeStatePath,
  });
  if (!managedAgents.length) {
    return { agents: [] };
  }

  return {
    agents: managedAgents.flatMap((managedAgent) => {
      const detail = buildAgentDetail(managedAgent.agentId, deps);
      if (!detail) {
        return [];
      }

      const latestEvent = detail.timeline[0];

      return [
        {
          agentId: managedAgent.agentId,
          name: managedAgent.agentName,
          currentGoal: detail.header.currentGoal ?? '当前还没有活动目标',
          workspace: managedAgent.workspace,
          session: managedAgent.session,
          managed: managedAgent.managed,
          learningVerdict: {
            level: detail.learningVerdict.overall.level,
            label: detail.learningVerdict.overall.label,
            reason: detail.learningVerdict.overall.reason,
          },
          lastActiveAt: detail.header.lastActiveAt,
          recentChangeSummary:
            latestEvent?.summary ??
            (detail.header.currentGoal
              ? '当前还没有新的学习事件。'
              : '当前还没有活动 goal，暂无学习历史。'),
        },
      ];
    }),
  };
}
