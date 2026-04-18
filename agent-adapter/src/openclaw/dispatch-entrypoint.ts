import type { AttemptEvidence, FailureType } from '../../../shared/types.js';
import type { AdapterClient } from '../client.js';
import { updateExternalToolGuard } from './runtime-state.js';
import { goalGetCurrent } from '../tools/goal-get-current.js';
import { evidenceRecord } from '../tools/evidence-record.js';
import { goalComplete } from '../tools/goal-complete.js';
import { checkRetryAndExplain } from '../workflows/check-retry-and-explain.js';
import { recordFailureAndRefresh } from '../workflows/record-failure-and-refresh.js';
import { recoverGoalSession } from '../workflows/recover-goal-session.js';
import { showGoalStatus } from '../workflows/show-goal-status.js';
import { startGoalSession } from '../workflows/start-goal-session.js';
import { superviseExternalGoal } from '../workflows/supervise-external-goal.js';

export type OpenClawEntrypoint =
  | 'start goal'
  | 'show goal status'
  | 'supervise external goal'
  | 'record evidence'
  | 'complete goal'
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

type SuperviseExternalGoalInput = {
  userMessage: string;
  receivedAt?: string;
  deadlineHours?: number;
  replaceActiveGoal?: boolean;
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

type RecordEvidenceInput = {
  goalId?: string;
  attemptId?: string;
  kind: AttemptEvidence['kind'];
  summary: string;
  uri?: string;
  filePath?: string;
  toolName?: string;
  observedAt?: string;
  verifier?: AttemptEvidence['verifier'];
  confidence?: number;
};

type CompleteGoalInput = {
  goalId?: string;
  evidenceIds: string[];
  summary: string;
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
  | { entrypoint: 'supervise external goal'; input: SuperviseExternalGoalInput }
  | { entrypoint: 'record evidence'; input: RecordEvidenceInput }
  | { entrypoint: 'complete goal'; input: CompleteGoalInput }
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
    case 'supervise external goal': {
      const result = await superviseExternalGoal(client, request.input);
      updateExternalToolGuard({
        runtimeStatePath: options?.runtimeStatePath,
        runtimeContext: options?.runtimeContext,
        guard: {
          status: 'needs_status_check',
          reason: 'An external-world goal was compiled into a GoalContract. Confirm alignment before external execution.',
          nextAction: 'Call goal_engine_show_goal_status with expectedGoalTitle before search, browsing, messaging, or payment-related execution.',
          updatedAt: new Date().toISOString(),
        },
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
    case 'record evidence': {
      if (!request.input.kind || !request.input.summary) {
        return {
          entrypoint: request.entrypoint,
          summary: 'Evidence was not recorded.\nProvide kind and summary. Valid kinds: artifact, external_fact, channel_check, permission_boundary, reply, payment, blocker.',
        };
      }

      const goalId = await resolveGoalId(client, request.input.goalId);
      if (!goalId) {
        return {
          entrypoint: request.entrypoint,
          summary: 'Evidence was not recorded.\nNo active goal could be inferred. Run show goal status or pass goalId.',
        };
      }

      const evidence = await evidenceRecord(client, {
        goalId,
        attemptId: request.input.attemptId,
        kind: request.input.kind,
        summary: request.input.summary,
        uri: request.input.uri,
        filePath: request.input.filePath,
        toolName: request.input.toolName,
        observedAt: request.input.observedAt,
        verifier: request.input.verifier,
        confidence: request.input.confidence,
      });
      return {
        entrypoint: request.entrypoint,
        summary: `Evidence recorded: ${evidence.id}\nKind: ${evidence.kind}\nSummary: ${evidence.summary}`,
      };
    }
    case 'complete goal': {
      if (!Array.isArray(request.input.evidenceIds) || request.input.evidenceIds.length === 0 || !request.input.summary) {
        return {
          entrypoint: request.entrypoint,
          summary: 'Goal was not completed.\nProvide evidenceIds and summary. Completion requires at least one Goal Engine evidence id.',
        };
      }

      const goalId = await resolveGoalId(client, request.input.goalId);
      if (!goalId) {
        return {
          entrypoint: request.entrypoint,
          summary: 'Goal was not completed.\nNo active goal could be inferred. Run show goal status or pass goalId.',
        };
      }

      const result = await goalComplete(client, {
        goalId,
        evidenceIds: request.input.evidenceIds,
        summary: request.input.summary,
      });
      return {
        entrypoint: request.entrypoint,
        summary: `Goal completed: ${result.goal.title}\nCompletion: ${result.completion.summary}\nEvidence ids: ${result.completion.evidenceIds.join(', ')}`,
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

async function resolveGoalId(client: AdapterClient, explicitGoalId: string | undefined): Promise<string | null> {
  if (explicitGoalId) {
    return explicitGoalId;
  }

  try {
    const goal = await goalGetCurrent(client);
    return goal.id;
  } catch (err: unknown) {
    if (isNoActiveGoalError(err)) {
      return null;
    }
    throw err;
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
