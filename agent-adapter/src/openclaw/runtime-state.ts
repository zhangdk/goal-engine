import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { DEFAULT_RUNTIME_STATE_PATH, DEFAULT_WORKSPACE_STATE_PATH } from './paths.js';

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

export type ExternalToolGuard = {
  status: 'clear' | 'needs_status_check' | 'blocked';
  reason: string;
  nextAction: string;
  updatedAt: string;
};

export type GoalEngineRuntimeEvent = {
  id: string;
  kind:
    | 'bootstrap'
    | 'supervise_external_goal'
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

export type SyncRuntimeStateInput = {
  workspaceStatePath?: string;
  runtimeStatePath?: string;
  runtimeContext?: {
    agentId: string;
    agentName: string;
    workspace: string;
    session: string;
  };
};

export type UpdateGoalAlignmentSnapshotInput = {
  runtimeStatePath?: string;
  runtimeContext?: SyncRuntimeStateInput['runtimeContext'];
  snapshot: GoalAlignmentSnapshot;
};

export type UpdateExternalToolGuardInput = {
  runtimeStatePath?: string;
  runtimeContext?: SyncRuntimeStateInput['runtimeContext'];
  guard: ExternalToolGuard;
};

export type AppendGoalEngineRuntimeEventInput = {
  runtimeStatePath?: string;
  runtimeContext?: SyncRuntimeStateInput['runtimeContext'];
  event: GoalEngineRuntimeEvent;
};

export function readCurrentManagedAgent(input: {
  runtimeStatePath?: string;
} = {}): ManagedOpenClawAgent | null {
  const runtimeState = readRuntimeState(input.runtimeStatePath ?? DEFAULT_RUNTIME_STATE_PATH);
  const currentAgentId = runtimeState.goalEngine?.currentManagedAgentId;

  if (!currentAgentId) {
    return null;
  }

  const managedAgents = runtimeState.goalEngine?.managedAgents ?? [];
  return managedAgents.find((agent) => agent.agentId === currentAgentId) ?? null;
}

export function syncRuntimeStateFromWorkspace(input: SyncRuntimeStateInput = {}): void {
  if (!input.runtimeContext) {
    return;
  }

  const runtimeStatePath = input.runtimeStatePath ?? DEFAULT_RUNTIME_STATE_PATH;
  const workspaceState = readWorkspaceState(input.workspaceStatePath ?? DEFAULT_WORKSPACE_STATE_PATH);
  const existingRuntimeState = readRuntimeState(runtimeStatePath);
  const managedAgents = mergeManagedAgents(
    workspaceState.goalEngine?.managedAgents ?? [],
    input.runtimeContext
  );

  mkdirSync(dirname(runtimeStatePath), { recursive: true });
  writeFileSync(
    runtimeStatePath,
    JSON.stringify(
      {
        goalEngine: {
          currentManagedAgentId: input.runtimeContext.agentId,
          managedAgents,
          goalAlignmentSnapshots: existingRuntimeState.goalEngine?.goalAlignmentSnapshots ?? {},
          externalToolGuards: existingRuntimeState.goalEngine?.externalToolGuards ?? {},
          runtimeEvents: existingRuntimeState.goalEngine?.runtimeEvents ?? {},
        },
      },
      null,
      2
    ),
    'utf-8'
  );
}

export function updateGoalAlignmentSnapshot(input: UpdateGoalAlignmentSnapshotInput): void {
  if (!input.runtimeContext) {
    return;
  }

  const runtimeStatePath = input.runtimeStatePath ?? DEFAULT_RUNTIME_STATE_PATH;
  const existingRuntimeState = readRuntimeState(runtimeStatePath);
  const managedAgents = mergeManagedAgents(
    existingRuntimeState.goalEngine?.managedAgents ?? [],
    input.runtimeContext
  );

  mkdirSync(dirname(runtimeStatePath), { recursive: true });
  writeFileSync(
    runtimeStatePath,
    JSON.stringify(
      {
        goalEngine: {
          currentManagedAgentId:
            existingRuntimeState.goalEngine?.currentManagedAgentId ?? input.runtimeContext.agentId,
          managedAgents,
          goalAlignmentSnapshots: {
            ...(existingRuntimeState.goalEngine?.goalAlignmentSnapshots ?? {}),
            [input.runtimeContext.agentId]: input.snapshot,
          },
          externalToolGuards: {
            ...(existingRuntimeState.goalEngine?.externalToolGuards ?? {}),
            [input.runtimeContext.agentId]: toExternalToolGuard(input.snapshot),
          },
          runtimeEvents: existingRuntimeState.goalEngine?.runtimeEvents ?? {},
        },
      },
      null,
      2
    ),
    'utf-8'
  );
}

export function updateExternalToolGuard(input: UpdateExternalToolGuardInput): void {
  if (!input.runtimeContext) {
    return;
  }

  const runtimeStatePath = input.runtimeStatePath ?? DEFAULT_RUNTIME_STATE_PATH;
  const existingRuntimeState = readRuntimeState(runtimeStatePath);
  const managedAgents = mergeManagedAgents(
    existingRuntimeState.goalEngine?.managedAgents ?? [],
    input.runtimeContext
  );

  mkdirSync(dirname(runtimeStatePath), { recursive: true });
  writeFileSync(
    runtimeStatePath,
    JSON.stringify(
      {
        goalEngine: {
          currentManagedAgentId:
            existingRuntimeState.goalEngine?.currentManagedAgentId ?? input.runtimeContext.agentId,
          managedAgents,
          goalAlignmentSnapshots: existingRuntimeState.goalEngine?.goalAlignmentSnapshots ?? {},
          externalToolGuards: {
            ...(existingRuntimeState.goalEngine?.externalToolGuards ?? {}),
            [input.runtimeContext.agentId]: input.guard,
          },
          runtimeEvents: existingRuntimeState.goalEngine?.runtimeEvents ?? {},
        },
      },
      null,
      2
    ),
    'utf-8'
  );
}

export function readExternalToolGuard(input: {
  runtimeStatePath?: string;
  agentId?: string;
} = {}): ExternalToolGuard | null {
  const runtimeState = readRuntimeState(input.runtimeStatePath ?? DEFAULT_RUNTIME_STATE_PATH);
  const agentId = input.agentId ?? runtimeState.goalEngine?.currentManagedAgentId;

  if (!agentId) {
    return null;
  }

  return runtimeState.goalEngine?.externalToolGuards?.[agentId] ?? null;
}

export function readGoalEngineRuntimeEvents(input: {
  runtimeStatePath?: string;
  agentId?: string;
} = {}): GoalEngineRuntimeEvent[] {
  const runtimeState = readRuntimeState(input.runtimeStatePath ?? DEFAULT_RUNTIME_STATE_PATH);
  const agentId = input.agentId ?? runtimeState.goalEngine?.currentManagedAgentId;

  if (!agentId) {
    return [];
  }

  return runtimeState.goalEngine?.runtimeEvents?.[agentId] ?? [];
}

export function appendGoalEngineRuntimeEvent(input: AppendGoalEngineRuntimeEventInput): void {
  if (!input.runtimeContext) {
    return;
  }

  const runtimeStatePath = input.runtimeStatePath ?? DEFAULT_RUNTIME_STATE_PATH;
  const existingRuntimeState = readRuntimeState(runtimeStatePath);
  const managedAgents = mergeManagedAgents(
    existingRuntimeState.goalEngine?.managedAgents ?? [],
    input.runtimeContext
  );
  const existingEvents = existingRuntimeState.goalEngine?.runtimeEvents?.[input.runtimeContext.agentId] ?? [];
  const nextEvents = [input.event, ...existingEvents].slice(0, 50);

  mkdirSync(dirname(runtimeStatePath), { recursive: true });
  writeFileSync(
    runtimeStatePath,
    JSON.stringify(
      {
        goalEngine: {
          currentManagedAgentId:
            existingRuntimeState.goalEngine?.currentManagedAgentId ?? input.runtimeContext.agentId,
          managedAgents,
          goalAlignmentSnapshots: existingRuntimeState.goalEngine?.goalAlignmentSnapshots ?? {},
          externalToolGuards: existingRuntimeState.goalEngine?.externalToolGuards ?? {},
          runtimeEvents: {
            ...(existingRuntimeState.goalEngine?.runtimeEvents ?? {}),
            [input.runtimeContext.agentId]: nextEvents,
          },
        },
      },
      null,
      2
    ),
    'utf-8'
  );
}

function readWorkspaceState(path: string): {
  goalEngine?: {
    managedAgents?: ManagedOpenClawAgent[];
  };
} {
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as {
      goalEngine?: {
        managedAgents?: ManagedOpenClawAgent[];
      };
    };
  } catch {
    return {};
  }
}

function readRuntimeState(path: string): {
  goalEngine?: {
    currentManagedAgentId?: string;
    managedAgents?: ManagedOpenClawAgent[];
    goalAlignmentSnapshots?: Record<string, GoalAlignmentSnapshot>;
    externalToolGuards?: Record<string, ExternalToolGuard>;
    runtimeEvents?: Record<string, GoalEngineRuntimeEvent[]>;
  };
} {
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as {
      goalEngine?: {
        currentManagedAgentId?: string;
        managedAgents?: ManagedOpenClawAgent[];
        goalAlignmentSnapshots?: Record<string, GoalAlignmentSnapshot>;
        externalToolGuards?: Record<string, ExternalToolGuard>;
        runtimeEvents?: Record<string, GoalEngineRuntimeEvent[]>;
      };
    };
  } catch {
    return {};
  }
}

function toExternalToolGuard(snapshot: GoalAlignmentSnapshot): ExternalToolGuard {
  if (snapshot.status === 'aligned') {
    return {
      status: 'clear',
      reason: 'Goal alignment confirmed.',
      nextAction: snapshot.nextAction,
      updatedAt: snapshot.checkedAt,
    };
  }

  return {
    status: snapshot.status === 'blocked' ? 'blocked' : 'needs_status_check',
    reason:
      snapshot.status === 'blocked'
        ? 'Goal alignment is blocked.'
        : 'No active goal is available yet.',
    nextAction: snapshot.nextAction,
    updatedAt: snapshot.checkedAt,
  };
}

function mergeManagedAgents(
  managedAgents: ManagedOpenClawAgent[],
  runtimeContext: NonNullable<SyncRuntimeStateInput['runtimeContext']>
): ManagedOpenClawAgent[] {
  if (managedAgents.length === 0) {
    return [toManagedAgent(runtimeContext)];
  }

  const hasMatchingAgent = managedAgents.some((agent) => agent.agentId === runtimeContext.agentId);
  const mergedAgents = managedAgents.map((agent) =>
    agent.agentId === runtimeContext.agentId
      ? {
          ...agent,
          agentName: runtimeContext.agentName,
          workspace: runtimeContext.workspace,
          session: runtimeContext.session,
          managed: true,
        }
      : agent
  );

  return hasMatchingAgent
    ? mergedAgents
    : [...mergedAgents, toManagedAgent(runtimeContext)];
}

function toManagedAgent(
  runtimeContext: NonNullable<SyncRuntimeStateInput['runtimeContext']>
): ManagedOpenClawAgent {
  return {
    agentId: runtimeContext.agentId,
    agentName: runtimeContext.agentName,
    workspace: runtimeContext.workspace,
    session: runtimeContext.session,
    managed: true,
  };
}
