import type { Attempt, Policy, RecoveryEvent, Reflection, RetryCheckEvent } from '../../../shared/types.js';
import type { TimelineEvent } from './timeline.js';
import type { ExecutionPathState } from './path-analysis.js';

type VerdictLevel = 'none' | 'partial' | 'clear' | 'stalled';
type VerdictStatus = 'yes' | 'no' | 'partial';

type VerdictSummary = {
  level: VerdictLevel;
  label: string;
  reason: string;
  evidenceEventIds: string[];
};

type LearningVerdict = {
  overall: VerdictSummary;
  behaviorChanged: {
    status: VerdictStatus;
    reason: string;
    evidenceEventIds: string[];
  };
  repeatErrorsReduced: {
    status: VerdictStatus;
    reason: string;
    evidenceEventIds: string[];
  };
  memoryPreserved: {
    status: VerdictStatus;
    reason: string;
    evidenceEventIds: string[];
  };
};

type VerdictInput = {
  attempts: Attempt[];
  reflections: Reflection[];
  policy: Policy | null;
  retryChecks: RetryCheckEvent[];
  recoveryEvents: RecoveryEvent[];
  timeline: TimelineEvent[];
  executionPathState: ExecutionPathState;
};

export function evaluateLearningVerdict(input: VerdictInput): LearningVerdict {
  const failures = input.attempts.filter((attempt) => attempt.result === 'failure');
  const progressAttempts = input.attempts.filter((attempt) => attempt.result !== 'failure');
  const latestFailure = failures[0] ?? null;
  const latestProgress = progressAttempts[0] ?? null;
  const hasReflection = input.reflections.length > 0;
  const hasPolicy = input.policy !== null;
  const repeatedFailure =
    input.executionPathState.repeatedPath ||
    (failures.length >= 2 &&
      failures[0]!.actionTaken === failures[1]!.actionTaken &&
      failures[0]!.stage === failures[1]!.stage);
  const changedBehavior =
    input.executionPathState.behaviorChangedForReal ||
    (
      latestFailure !== null &&
      latestProgress !== null &&
      latestProgress.createdAt > latestFailure.createdAt &&
      latestProgress.actionTaken !== latestFailure.actionTaken
    );

  const behaviorChanged = changedBehavior
    ? {
        status: 'yes' as const,
        reason: input.executionPathState.whyDifferent
          ? `Later attempts took a different path after the failed one. ${input.executionPathState.whyDifferent}`
          : 'Later attempts took a different path after the failed one.',
        evidenceEventIds: input.executionPathState.evidenceEventIds.length > 0
          ? input.executionPathState.evidenceEventIds
          : buildEvidenceIds(input.timeline, ['progress', 'failure']),
      }
    : hasReflection || hasPolicy
      ? {
          status: 'partial' as const,
          reason: 'New guidance exists, but there is not enough follow-up behavior yet.',
          evidenceEventIds: buildEvidenceIds(input.timeline, ['reflection', 'policy_update']),
        }
      : {
          status: 'no' as const,
          reason: 'There is no reflected strategy change yet.',
          evidenceEventIds: buildEvidenceIds(input.timeline, ['failure']),
        };

  const latestRetryCheck = input.retryChecks[0] ?? null;
  const repeatErrorsReduced =
    changedBehavior && hasPolicy
      ? {
          status: 'yes' as const,
          reason:
            input.executionPathState.latestFailurePathLabel && input.executionPathState.latestAttemptPathLabel
              ? `The agent stopped repeating ${input.executionPathState.latestFailurePathLabel} and moved to ${input.executionPathState.latestAttemptPathLabel}.`
              : 'The agent has guidance and later behavior diverged from the repeated path.',
          evidenceEventIds: input.executionPathState.evidenceEventIds.length > 0
            ? input.executionPathState.evidenceEventIds
            : buildEvidenceIds(input.timeline, ['policy_update', 'progress']),
        }
      : latestRetryCheck && !latestRetryCheck.allowed
        ? {
            status: 'partial' as const,
            reason: 'A repeated retry path was explicitly blocked and preserved as evidence.',
            evidenceEventIds: buildEvidenceIds(input.timeline, ['retry_check']),
          }
      : hasPolicy
        ? {
            status: 'partial' as const,
            reason: 'Repeated strategies are now called out, but no persisted retry-check evidence exists yet.',
            evidenceEventIds: buildEvidenceIds(input.timeline, ['policy_update']),
          }
        : {
            status: 'no' as const,
            reason: repeatedFailure
              ? 'Recent failures still repeat the same path.'
              : 'There is no evidence that repeat errors are being reduced yet.',
            evidenceEventIds: buildEvidenceIds(input.timeline, ['failure']),
          };

  const hasRecoveryEvent = input.recoveryEvents.length > 0;
  const projectionNoticeIds = buildEvidenceIds(input.timeline, ['projection_notice']);
  const hasProjectionNotice = projectionNoticeIds.length > 0;
  const runtimeSignalIds = buildEvidenceIds(input.timeline, ['runtime_signal']);
  const hasRuntimeSignal = runtimeSignalIds.length > 0;
  const hasGoalAlignmentNotice = input.timeline.some(
    (event) => event.type === 'projection_notice' && (event.title === '目标未对齐' || event.summary.includes('OpenClaw 当前任务与 active goal 不一致'))
  );
  const hasRuntimeAlignmentBlock = input.timeline.some(
    (event) => event.type === 'runtime_signal' && event.title === '对齐阻塞'
  );
  const memoryPreserved = hasRecoveryEvent
    ? hasPolicy || latestFailure !== null || latestProgress !== null
      ? {
          status: 'yes' as const,
          reason: 'The current goal context has been rebuilt and the recovery event was persisted.',
          evidenceEventIds: buildEvidenceIds(input.timeline, ['recovery', 'policy_update']),
        }
      : {
          status: 'partial' as const,
          reason: 'A recovery event exists, but there is still little goal history behind it.',
          evidenceEventIds: buildEvidenceIds(input.timeline, ['recovery']),
        }
    : {
        status: 'no' as const,
        reason: 'There is no persisted recovery event yet.',
        evidenceEventIds: [],
      };

  const overall = deriveOverall({
    repeatedFailure,
    changedBehavior,
    hasReflection,
    hasPolicy,
    hasProjectionNotice,
    hasGoalAlignmentNotice,
    projectionNoticeIds,
    hasRuntimeSignal,
    hasRuntimeAlignmentBlock,
    runtimeSignalIds,
    behaviorChanged,
    repeatErrorsReduced,
    memoryPreserved,
  });

  return {
    overall,
    behaviorChanged,
    repeatErrorsReduced,
    memoryPreserved,
  };
}

function deriveOverall(input: {
  repeatedFailure: boolean;
  changedBehavior: boolean;
  hasReflection: boolean;
  hasPolicy: boolean;
  hasProjectionNotice: boolean;
  hasGoalAlignmentNotice: boolean;
  projectionNoticeIds: string[];
  hasRuntimeSignal: boolean;
  hasRuntimeAlignmentBlock: boolean;
  runtimeSignalIds: string[];
  behaviorChanged: { status: VerdictStatus; reason: string; evidenceEventIds: string[] };
  repeatErrorsReduced: { status: VerdictStatus; reason: string; evidenceEventIds: string[] };
  memoryPreserved: { status: VerdictStatus; reason: string; evidenceEventIds: string[] };
}): VerdictSummary {
  if (input.repeatedFailure && !input.hasReflection && !input.hasPolicy) {
    return {
      level: 'stalled',
      label: '停滞',
      reason: '最近的失败仍在重复同一路径，还没有形成新的策略。',
      evidenceEventIds: input.behaviorChanged.evidenceEventIds,
    };
  }

  if (input.changedBehavior && input.repeatErrorsReduced.status !== 'no') {
    return {
      level: 'clear',
      label: '明显改善',
      reason: '一次失败已经转化为新 guidance，而且下一轮路径与上一轮明显不同。',
      evidenceEventIds: [
        ...input.behaviorChanged.evidenceEventIds,
        ...input.repeatErrorsReduced.evidenceEventIds,
      ],
    };
  }

  if (
    input.behaviorChanged.status === 'partial' ||
    input.repeatErrorsReduced.status === 'partial' ||
    input.memoryPreserved.status !== 'no'
  ) {
    return {
      level: 'partial',
      label: '部分改善',
      reason: '系统已经出现新的 guidance 或可恢复上下文，但行为变化证据还不完整。',
      evidenceEventIds: [
        ...input.behaviorChanged.evidenceEventIds,
        ...input.memoryPreserved.evidenceEventIds,
      ],
    };
  }

  if (input.hasProjectionNotice) {
    return {
      level: 'partial',
      label: '观察到偏差',
      reason: input.hasGoalAlignmentNotice
        ? 'OpenClaw 当前任务与 service active goal 尚未对齐。'
        : 'Service active goal 已变化，但本地 projection 摘要还没有跟上。',
      evidenceEventIds: input.projectionNoticeIds,
    };
  }

  if (input.hasRuntimeSignal) {
    return {
      level: 'partial',
      label: input.hasRuntimeAlignmentBlock ? '观察到偏差' : '已有运行证据',
      reason: input.hasRuntimeAlignmentBlock
        ? 'Goal Engine 已明确阻止当前任务继续执行，等待先完成 goal 对齐。'
        : 'OpenClaw 已经触发 Goal Engine 运行链路，UI 可以观察到真实运行事件。',
      evidenceEventIds: input.runtimeSignalIds,
    };
  }

  return {
    level: 'none',
    label: '暂无证据',
    reason: '目前还没有足够证据证明这个 Agent 已经发生了变化。',
    evidenceEventIds: [],
  };
}

function buildEvidenceIds(
  timeline: TimelineEvent[],
  types: Array<TimelineEvent['type']>
): string[] {
  return timeline.filter((event) => types.includes(event.type)).map((event) => event.id);
}
