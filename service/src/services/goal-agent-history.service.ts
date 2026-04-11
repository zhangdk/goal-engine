import { randomUUID } from 'node:crypto';
import type { GoalRepo } from '../repos/goal.repo.js';
import type { GoalAgentAssignmentRepo } from '../repos/goal-agent-assignment.repo.js';
import { getCurrentManagedOpenClawAgent } from '../ui/managed-openclaw-agents.js';

type GoalAgentHistoryServiceOptions = {
  workspaceStatePath?: string;
  runtimeStatePath?: string;
};

export class GoalAgentHistoryService {
  constructor(
    private goalRepo: GoalRepo,
    private goalAgentAssignmentRepo: GoalAgentAssignmentRepo,
    private options?: GoalAgentHistoryServiceOptions
  ) {}

  recordGoalStart(goalId: string, timestamp: string, agentId?: string): void {
    this.touchGoal(goalId, 'goal_started', timestamp, agentId);
  }

  touchGoal(
    goalId: string,
    reason: 'goal_started' | 'attempt_recorded' | 'reflection_recorded' | 'retry_checked' | 'recovery',
    timestamp = new Date().toISOString(),
    agentId?: string
  ): void {
    const goal = agentId ? this.goalRepo.getById(agentId, goalId) : this.goalRepo.getById(goalId);
    const managedAgent = getCurrentManagedOpenClawAgent(this.options);
    if (!goal || !managedAgent) {
      return;
    }

    const existingOpenAssignment = this.goalAgentAssignmentRepo.getOpenByGoal(goalId);
    if (!existingOpenAssignment) {
      this.goalAgentAssignmentRepo.create({
        id: randomUUID(),
        goalId,
        agentId: managedAgent.agentId,
        agentName: managedAgent.agentName,
        workspace: managedAgent.workspace,
        session: managedAgent.session,
        assignmentReason: reason === 'goal_started' ? 'goal_started' : 'runtime_switch',
        assignedAt: timestamp,
      });
      return;
    }

    const matchesCurrentRuntime =
      existingOpenAssignment.agentId === managedAgent.agentId &&
      existingOpenAssignment.session === managedAgent.session &&
      existingOpenAssignment.workspace === managedAgent.workspace;

    if (matchesCurrentRuntime) {
      return;
    }

    const isSameAgent = existingOpenAssignment.agentId === managedAgent.agentId;
    const assignmentReason = isSameAgent ? 'session_rollover' : 'runtime_switch';

    this.goalAgentAssignmentRepo.closeOpenForGoal(goalId, timestamp);
    this.goalAgentAssignmentRepo.create({
      id: randomUUID(),
      goalId,
      agentId: managedAgent.agentId,
      agentName: managedAgent.agentName,
      workspace: managedAgent.workspace,
      session: managedAgent.session,
      assignmentReason,
      assignedAt: timestamp,
    });
  }

  syncActiveGoalAttachment(timestamp: string): void {
    const activeGoal = this.goalRepo.getCurrent();
    if (!activeGoal) {
      return;
    }
    this.touchGoal(activeGoal.id, 'recovery', timestamp);
  }
}
