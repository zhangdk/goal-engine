import type { AdapterClient } from '../client.js';
import { goalGetCurrent } from '../tools/goal-get-current.js';
import { policyGetCurrent } from '../tools/policy-get-current.js';
import { loadProjectionState, type ProjectionState } from '../projections/load-projection-state.js';
import type { Goal, Policy } from '../../../shared/types.js';
import { DEFAULT_PROJECTION_DIR } from '../openclaw/paths.js';
import { updateGoalAlignmentSnapshot } from '../openclaw/runtime-state.js';

export type ShowGoalStatusInput = {
  projectionDir?: string;
  expectedGoalTitle?: string;
  runtimeStatePath?: string;
  runtimeContext?: {
    agentId: string;
    agentName: string;
    workspace: string;
    session: string;
  };
};

export type ShowGoalStatusResult = {
  summary: string;
};

export async function showGoalStatus(
  client: AdapterClient,
  input: ShowGoalStatusInput = {}
): Promise<ShowGoalStatusResult> {
  let goal: Goal;

  try {
    goal = await goalGetCurrent(client);
  } catch (err: unknown) {
    if (isNoActiveGoalError(err)) {
      maybeWriteGoalAlignmentSnapshot({
        input,
        status: 'no_active_goal',
        activeGoalTitle: null,
        projectionGoalTitle: extractMarkdownSection(
          (await loadProjectionState({ projectionDir: input.projectionDir ?? DEFAULT_PROJECTION_DIR })).currentGoalPreview,
          '目标'
        ) ?? null,
        checkedAt: new Date().toISOString(),
        nextAction: 'Use start goal to create one before continuing.',
      });
      return {
        summary: [
          'No active goal right now.',
          'Use start goal to create one, then show goal status again.',
        ].join('\n'),
      };
    }

    throw err;
  }

  const projectionDir = input.projectionDir ?? DEFAULT_PROJECTION_DIR;
  const projectionState = await loadProjectionState({ projectionDir });
  const checkedAt = new Date().toISOString();

  let policy: Policy | null = null;

  try {
    policy = await policyGetCurrent(client, goal.id);
  } catch (err: unknown) {
    if (!isNoPolicyYetError(err)) {
      throw err;
    }
  }

  const projectionGoalTitle = extractMarkdownSection(projectionState.currentGoalPreview, '目标') ?? null;
  const alignment = buildAlignmentStatus({
    serviceGoalTitle: goal.title,
    projectionGoalTitle: projectionGoalTitle ?? undefined,
    expectedGoalTitle: input.expectedGoalTitle,
    checkedAt,
  });
  maybeWriteGoalAlignmentSnapshot({
    input,
    status: alignment.blocked ? 'blocked' : 'aligned',
    activeGoalTitle: goal.title,
    projectionGoalTitle,
    checkedAt: alignment.checkedAt,
    nextAction: alignment.nextAction,
  });

  return {
    summary: buildStatusSummary({
      goal,
      policy,
      projectionState,
      expectedGoalTitle: input.expectedGoalTitle,
      alignment,
    }),
  };
}

function buildStatusSummary(input: {
  goal: Goal;
  policy: Policy | null;
  projectionState: ProjectionState;
  expectedGoalTitle?: string;
  alignment: ReturnType<typeof buildAlignmentStatus>;
}): string {
  const lines = [
    `Goal status: ${input.goal.title}`,
    `Current stage: ${input.goal.currentStage}`,
    `Success criteria:`,
    ...input.goal.successCriteria.map(item => `- ${item}`),
  ];
  const projectionGoalTitle = extractMarkdownSection(input.projectionState.currentGoalPreview, '目标');

  const lastFailureSummary = extractMarkdownSection(input.projectionState.recoveryPacketPreview, '最近失败摘要')
    ?? extractMarkdownSection(input.projectionState.currentGoalPreview, '最近失败摘要');
  lines.push(`Recent failure: ${lastFailureSummary ?? 'None'}`);

  if (input.policy) {
    lines.push(`Current guidance: Next step: ${input.policy.preferredNextStep ?? 'None'}`);
    lines.push(`Avoid: ${input.policy.avoidStrategies.length > 0 ? input.policy.avoidStrategies.map(item => `- ${item}`).join(', ') : 'None'}`);
  } else {
    lines.push('Current guidance: not available yet.');
  }

  if (input.alignment.blocked) {
    lines.push('Goal alignment: blocked.');
    lines.push('Execution permission: denied until the active goal is aligned.');
    lines.push(`Current active goal: ${input.goal.title}`);
    lines.push(`Expected task goal: ${input.alignment.expectedGoalTitle}`);
    if (projectionGoalTitle) {
      lines.push(`Local projection goal: ${projectionGoalTitle}`);
    }
    lines.push('Do not continue search, browsing, or external tool execution yet.');
    lines.push('Only allowed next actions: goal_engine_start_goal, goal_engine_recover_current_goal, or explicitly replacing the active goal.');
    lines.push(`Next action: ${input.alignment.nextAction}`);
  } else if (projectionGoalTitle && projectionGoalTitle !== input.goal.title) {
    lines.push(`Goal alignment: local projection still points to "${projectionGoalTitle}", but service active goal is "${input.goal.title}".`);
  } else if (projectionGoalTitle) {
    lines.push('Goal alignment: local projection matches the service active goal.');
  }

  lines.push(`Local projection: ${describeProjectionState(input.projectionState)}`);

  return lines.join('\n');
}

function buildAlignmentStatus(input: {
  serviceGoalTitle: string;
  projectionGoalTitle?: string;
  expectedGoalTitle?: string;
  checkedAt: string;
}): {
  blocked: boolean;
  expectedGoalTitle: string | null;
  checkedAt: string;
  nextAction: string;
} {
  if (input.expectedGoalTitle && input.expectedGoalTitle !== input.serviceGoalTitle) {
    return {
      blocked: true,
      expectedGoalTitle: input.expectedGoalTitle,
      checkedAt: input.checkedAt,
      nextAction: 'Use goal_engine_start_goal, replaceActiveGoal, or goal_engine_recover_current_goal before any search or browsing.',
    };
  }

  if (input.projectionGoalTitle && input.projectionGoalTitle !== input.serviceGoalTitle) {
    return {
      blocked: false,
      expectedGoalTitle: input.expectedGoalTitle ?? null,
      checkedAt: input.checkedAt,
      nextAction: 'Run recover current goal to rebuild the local summary files.',
    };
  }

  return {
    blocked: false,
    expectedGoalTitle: input.expectedGoalTitle ?? null,
    checkedAt: input.checkedAt,
    nextAction: 'Current goal is aligned. Continue with the smallest next step.',
  };
}

function maybeWriteGoalAlignmentSnapshot(input: {
  input: ShowGoalStatusInput;
  status: 'aligned' | 'blocked' | 'no_active_goal';
  activeGoalTitle: string | null;
  projectionGoalTitle: string | null;
  checkedAt: string;
  nextAction: string;
}): void {
  if (!input.input.runtimeContext) {
    return;
  }

  updateGoalAlignmentSnapshot({
    runtimeStatePath: input.input.runtimeStatePath,
    runtimeContext: input.input.runtimeContext,
    snapshot: {
      status: input.status,
      expectedGoalTitle: input.input.expectedGoalTitle ?? null,
      activeGoalTitle: input.activeGoalTitle,
      projectionGoalTitle: input.projectionGoalTitle,
      nextAction: input.nextAction,
      checkedAt: input.checkedAt,
    },
  });
}

function describeProjectionState(projectionState: ProjectionState): string {
  const isComplete = projectionState.hasCurrentGoal
    && projectionState.hasCurrentPolicy
    && projectionState.hasRecoveryPacket;

  if (isComplete) {
    return 'ready';
  }

  const missing = [
    !projectionState.hasCurrentGoal ? 'current goal' : null,
    !projectionState.hasCurrentPolicy ? 'current guidance' : null,
    !projectionState.hasRecoveryPacket ? 'recovery summary' : null,
  ].filter((item): item is string => item !== null);

  return missing.length > 0
    ? `missing ${missing.join(', ')}. Run recover current goal to rebuild the local summary files.`
    : 'ready';
}

function extractMarkdownSection(markdown: string | undefined, heading: string): string | undefined {
  if (!markdown) {
    return undefined;
  }

  const normalized = markdown.replace(/\r\n/g, '\n');
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = normalized.match(new RegExp(`##\\s*${escapedHeading}\\s*\\n+([\\s\\S]*?)(?:\\n##\\s+|$)`));
  const body = (match?.[1] ?? '').trim();

  if (!body) {
    return undefined;
  }

  const lines = body
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('>'));

  if (lines.length === 0) {
    return undefined;
  }

  return lines.join(' ');
}

function isNoActiveGoalError(err: unknown): boolean {
  return typeof err === 'object'
    && err !== null
    && 'code' in err
    && err.code === 'no_active_goal';
}

function isNoPolicyYetError(err: unknown): boolean {
  return typeof err === 'object'
    && err !== null
    && 'code' in err
    && err.code === 'no_policy_yet';
}
