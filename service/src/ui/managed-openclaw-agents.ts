import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type ManagedOpenClawAgent = {
  agentId: string;
  agentName: string;
  workspace: string;
  session: string;
  managed: boolean;
};

export type GoalAlignmentSnapshot = {
  status: 'aligned' | 'blocked' | 'no_active_goal';
  expectedGoalTitle: string | null;
  activeGoalTitle: string | null;
  projectionGoalTitle: string | null;
  nextAction: string;
  checkedAt: string;
};

export type GoalEngineRuntimeEvent = {
  id: string;
  kind:
    | 'bootstrap'
    | 'start_goal'
    | 'show_goal_status'
    | 'record_failed_attempt'
    | 'recover_current_goal'
    | 'check_retry'
    | 'external_tool_guard';
  status: 'ok' | 'warning' | 'blocked' | 'error';
  title: string;
  summary: string;
  detail?: string;
  createdAt: string;
};

type WorkspaceState = {
  goalEngine?: {
    currentManagedAgentId?: string;
    managedAgents?: ManagedOpenClawAgent[];
    goalAlignmentSnapshots?: Record<string, GoalAlignmentSnapshot>;
    runtimeEvents?: Record<string, GoalEngineRuntimeEvent[]>;
  };
};

const defaultWorkspaceStatePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../.openclaw/workspace-state.json'
);
const defaultRuntimeStatePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../.openclaw/runtime-state.json'
);

type ManagedAgentStatePaths = {
  workspaceStatePath?: string;
  runtimeStatePath?: string;
};

export function listManagedOpenClawAgents(paths?: ManagedAgentStatePaths): ManagedOpenClawAgent[] {
  const state = readManagedAgentState(paths);
  return state.managedAgents;
}

export function getCurrentManagedOpenClawAgent(
  paths?: ManagedAgentStatePaths
): ManagedOpenClawAgent | null {
  const state = readManagedAgentState(paths);
  const currentManagedAgentId = state.currentManagedAgentId;
  if (!currentManagedAgentId) {
    return null;
  }

  return state.managedAgents.find((agent) => agent.agentId === currentManagedAgentId) ?? null;
}

export function getManagedOpenClawAgentById(
  agentId: string,
  paths?: ManagedAgentStatePaths
): ManagedOpenClawAgent | null {
  return listManagedOpenClawAgents(paths).find((agent) => agent.agentId === agentId) ?? null;
}

export function getGoalAlignmentSnapshotByAgentId(
  agentId: string,
  paths?: ManagedAgentStatePaths
): GoalAlignmentSnapshot | null {
  const state = readManagedAgentState(paths);
  return state.goalAlignmentSnapshots[agentId] ?? null;
}

export function getRuntimeEventsByAgentId(
  agentId: string,
  paths?: ManagedAgentStatePaths
): GoalEngineRuntimeEvent[] {
  const state = readManagedAgentState(paths);
  return state.runtimeEvents[agentId] ?? [];
}

function readManagedAgentState(paths?: ManagedAgentStatePaths): {
  currentManagedAgentId?: string;
  managedAgents: ManagedOpenClawAgent[];
  goalAlignmentSnapshots: Record<string, GoalAlignmentSnapshot>;
  runtimeEvents: Record<string, GoalEngineRuntimeEvent[]>;
} {
  const workspaceState = readStateFile(paths?.workspaceStatePath ?? defaultWorkspaceStatePath);
  const runtimeState = readStateFile(paths?.runtimeStatePath ?? defaultRuntimeStatePath);

  return {
    currentManagedAgentId:
      runtimeState.goalEngine?.currentManagedAgentId
      ?? workspaceState.goalEngine?.currentManagedAgentId,
    managedAgents:
      runtimeState.goalEngine?.managedAgents
      ?? workspaceState.goalEngine?.managedAgents
      ?? [],
    goalAlignmentSnapshots:
      runtimeState.goalEngine?.goalAlignmentSnapshots
      ?? workspaceState.goalEngine?.goalAlignmentSnapshots
      ?? {},
    runtimeEvents:
      runtimeState.goalEngine?.runtimeEvents
      ?? workspaceState.goalEngine?.runtimeEvents
      ?? {},
  };
}

function readStateFile(resolvedPath: string): WorkspaceState {
  if (!existsSync(resolvedPath)) {
    return {};
  }

  try {
    const content = readFileSync(resolvedPath, 'utf-8');
    return JSON.parse(content) as WorkspaceState;
  } catch {
    return {};
  }
}
