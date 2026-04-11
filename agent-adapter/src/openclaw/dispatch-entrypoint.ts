import type { FailureType } from '../../../shared/types.js';
import type { AdapterClient } from '../client.js';
import { updateExternalToolGuard } from './runtime-state.js';
import { goalGetCurrent } from '../tools/goal-get-current.js';
import { checkRetryAndExplain } from '../workflows/check-retry-and-explain.js';
import { recordFailureAndRefresh } from '../workflows/record-failure-and-refresh.js';
import { recoverGoalSession } from '../workflows/recover-goal-session.js';
import { showGoalStatus } from '../workflows/show-goal-status.js';
import { startGoalSession } from '../workflows/start-goal-session.js';

export type OpenClawEntrypoint =
  | 'start goal'
  | 'show goal status'
  | 'record failed attempt'
  | 'recover current goal'
  | 'check retry';

type StartGoalInput = {
  title: string;
  successCriteria: string[];
  currentStage?: string;
  stopConditions?: string[];
  priority?: number;
  replaceActiveGoal?: boolean;
  projectionDir?: string;
};

type ShowGoalStatusInput = {
  projectionDir?: string;
};

type RecordFailedAttemptInput = {
  stage: string;
  actionTaken: string;
  strategyTags: string[];
  failureType: FailureType | 'tool_unavailable';
  confidence?: number;
  nextHypothesis?: string;
  projectionDir?: string;
};

type RecoverCurrentGoalInput = {
  projectionDir?: string;
};

type CheckRetryInput = {
  plannedAction: string;
  whatChanged: string;
  strategyTags: string[];
  policyAcknowledged: boolean;
};

export type DispatchEntrypointInput =
  | { entrypoint: 'start goal'; input: StartGoalInput }
  | { entrypoint: 'show goal status'; input?: ShowGoalStatusInput }
  | { entrypoint: 'record failed attempt'; input: RecordFailedAttemptInput }
  | { entrypoint: 'recover current goal'; input?: RecoverCurrentGoalInput }
  | { entrypoint: 'check retry'; input: CheckRetryInput };

export type DispatchEntrypointResult = {
  entrypoint: OpenClawEntrypoint;
  summary: string;
  rawReason?: string;
};

export async function dispatchEntrypoint(
  client: AdapterClient,
  request: DispatchEntrypointInput,
  options?: {
    runtimeStatePath?: string;
    runtimeContext?: {
      agentId: string;
      agentName: string;
      workspace: string;
      session: string;
    };
  }
): Promise<DispatchEntrypointResult> {
  switch (request.entrypoint) {
    case 'start goal': {
      const result = await startGoalSession(client, request.input);
      updateExternalToolGuard({
        runtimeStatePath: options?.runtimeStatePath,
        runtimeContext: options?.runtimeContext,
        guard: {
          status: 'needs_status_check',
          reason: 'A goal was started or replaced. Confirm alignment with goal_engine_show_goal_status before any external tool use.',
          nextAction: 'Call goal_engine_show_goal_status with expectedGoalTitle before search, browsing, or external execution.',
          updatedAt: new Date().toISOString(),
        },
      });
      return {
        entrypoint: request.entrypoint,
        summary: result.summary,
      };
    }
    case 'show goal status': {
      const result = await showGoalStatus(client, {
        ...request.input,
        runtimeStatePath: options?.runtimeStatePath,
        runtimeContext: options?.runtimeContext,
      });
      return {
        entrypoint: request.entrypoint,
        summary: result.summary,
      };
    }
    case 'record failed attempt': {
      const goal = await goalGetCurrent(client);
      const failureType = normalizeFailureType(request.input.failureType);
      const result = await recordFailureAndRefresh(client, {
        goalId: goal.id,
        stage: request.input.stage,
        actionTaken: request.input.actionTaken,
        strategyTags: request.input.strategyTags,
        failureType,
        confidence: request.input.confidence,
        nextHypothesis: request.input.nextHypothesis,
        projectionDir: request.input.projectionDir,
      });
      return {
        entrypoint: request.entrypoint,
        summary: `Failed attempt recorded.\n${result.guidanceSummary}`,
      };
    }
    case 'recover current goal': {
      try {
        const goal = await goalGetCurrent(client);
        const result = await recoverGoalSession(client, {
          goalId: goal.id,
          projectionDir: request.input?.projectionDir,
        });
        return {
          entrypoint: request.entrypoint,
          summary: result.summary,
        };
      } catch (err: unknown) {
        if (!isNoActiveGoalError(err)) {
          throw err;
        }

        return {
          entrypoint: request.entrypoint,
          summary: 'No active goal right now.\nUse start goal to create one before trying to recover state.',
        };
      }
    }
    case 'check retry': {
      const goal = await goalGetCurrent(client);
      const result = await checkRetryAndExplain(client, {
        goalId: goal.id,
        plannedAction: request.input.plannedAction,
        whatChanged: request.input.whatChanged,
        strategyTags: request.input.strategyTags,
        policyAcknowledged: request.input.policyAcknowledged,
      });
      return {
        entrypoint: request.entrypoint,
        summary: result.allowed
          ? `Retry check: allowed.\n${result.explanation}`
          : `Retry check: blocked.\n${result.explanation}`,
        rawReason: result.rawReason,
      };
    }
    default: {
      return assertNever(request);
    }
  }
}

function isNoActiveGoalError(err: unknown): boolean {
  return typeof err === 'object'
    && err !== null
    && 'code' in err
    && err.code === 'no_active_goal';
}

function normalizeFailureType(failureType: FailureType | 'tool_unavailable'): FailureType {
  if (failureType === 'tool_unavailable') {
    return 'external_blocker';
  }

  return failureType;
}

function assertNever(value: never): never {
  throw new Error(`Unsupported OpenClaw entrypoint: ${JSON.stringify(value)}`);
}
