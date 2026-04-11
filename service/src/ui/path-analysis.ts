import type { Attempt, Policy, RetryCheckEvent } from '../../../shared/types.js';
import type { GoalEngineRuntimeEvent } from './managed-openclaw-agents.js';

export type PathSnapshot = {
  evidenceId: string;
  key: string;
  label: string;
  raw: string;
  timestamp: string;
};

export type ExecutionPathState = {
  lastPath: string | null;
  nextPath: string | null;
  whyDifferent: string | null;
  forbiddenPaths: string[];
  latestFailurePathKey: string | null;
  latestFailurePathLabel: string | null;
  latestAttemptPathKey: string | null;
  latestAttemptPathLabel: string | null;
  behaviorChangedForReal: boolean;
  repeatedPath: boolean;
  evidenceEventIds: string[];
};

type ExecutionPathInput = {
  attempts: Attempt[];
  policy: Policy | null;
  retryChecks: RetryCheckEvent[];
  runtimeEvents: GoalEngineRuntimeEvent[];
};

const PATH_PATTERNS: Array<{ key: string; label: string; patterns: RegExp[] }> = [
  { key: 'web_search', label: 'web_search', patterns: [/web[_ -]?search/i] },
  {
    key: 'multi-search-engine',
    label: 'multi-search-engine',
    patterns: [/multi[- ]search[- ]engine/i, /multi_search_engine/i],
  },
  { key: 'web_fetch', label: 'web_fetch', patterns: [/web[_ -]?fetch/i] },
  {
    key: 'agent_browser',
    label: 'Agent Browser',
    patterns: [/agent browser/i, /browser/i],
  },
  {
    key: 'feishu_doc',
    label: 'Feishu docs',
    patterns: [/feishu/i, /lark/i, /wiki/i, /drive/i, /doc/i],
  },
  {
    key: 'native_app',
    label: 'native app',
    patterns: [/native app/i, /local native/i, /本机原生/i, /本机软件/i],
  },
  {
    key: 'direct_site',
    label: 'direct site',
    patterns: [/direct site/i, /官网/i, /official site/i, /studio website/i],
  },
  {
    key: 'vertical_platform',
    label: 'vertical platform',
    patterns: [/vertical platform/i, /商业地产平台/i, /垂直平台/i, /marketplace/i],
  },
  {
    key: 'tool_gap',
    label: 'tool gap',
    patterns: [/tool gap/i, /tool_unavailable/i, /tool unavailable/i],
  },
];

export function deriveExecutionPathState(input: ExecutionPathInput): ExecutionPathState {
  const attemptsAsc = [...input.attempts].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  const retryChecksDesc = [...input.retryChecks].sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  const attemptSnapshots = attemptsAsc.map((attempt) =>
    createPathSnapshot({
      raw: attempt.actionTaken,
      strategyTags: attempt.strategyTags,
      evidenceId: `${attempt.result === 'failure' ? 'failure' : 'progress'}:${attempt.id}`,
      timestamp: attempt.createdAt,
    })
  );
  const latestAttempt = attemptSnapshots.at(-1) ?? null;
  const previousAttempt = attemptSnapshots.length >= 2 ? attemptSnapshots[attemptSnapshots.length - 2] ?? null : null;
  const latestFailureAttempt = [...input.attempts]
    .filter((attempt) => attempt.result === 'failure')
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
  const latestFailureSnapshot = latestFailureAttempt
    ? createPathSnapshot({
        raw: latestFailureAttempt.actionTaken,
        strategyTags: latestFailureAttempt.strategyTags,
        evidenceId: `failure:${latestFailureAttempt.id}`,
        timestamp: latestFailureAttempt.createdAt,
      })
    : null;
  const latestRetry = retryChecksDesc[0] ?? null;
  const nextPathSnapshot = latestRetry
    ? createPathSnapshot({
        raw: latestRetry.plannedAction,
        strategyTags: latestRetry.strategyTags,
        evidenceId: `retry:${latestRetry.id}`,
        timestamp: latestRetry.createdAt,
      })
    : input.policy?.preferredNextStep
      ? createPathSnapshot({
          raw: input.policy.preferredNextStep,
          strategyTags: input.policy.avoidStrategies,
          evidenceId: `policy:${input.policy.id}`,
          timestamp: input.policy.updatedAt,
        })
      : null;

  const runtimeFallbackPath = latestAttempt
    ? null
    : deriveRuntimeFallbackPath(input.runtimeEvents);

  const forbiddenPaths = Array.from(
    new Set((input.policy?.avoidStrategies ?? []).map((item) => inferPathLabel(item, [item])))
  );

  const behaviorChangedForReal =
    latestAttempt !== null &&
    previousAttempt !== null &&
    latestAttempt.key !== previousAttempt.key &&
    latestAttempt.timestamp > previousAttempt.timestamp;

  const repeatedPath =
    latestAttempt !== null &&
    previousAttempt !== null &&
    latestAttempt.key === previousAttempt.key;

  return {
    lastPath: latestAttempt?.label ?? runtimeFallbackPath?.label ?? null,
    nextPath: nextPathSnapshot?.label ?? null,
    whyDifferent: deriveWhyDifferent({
      latestRetry,
      previousAttempt,
      latestAttempt,
      policy: input.policy,
    }),
    forbiddenPaths,
    latestFailurePathKey: latestFailureSnapshot?.key ?? null,
    latestFailurePathLabel: latestFailureSnapshot?.label ?? null,
    latestAttemptPathKey: latestAttempt?.key ?? runtimeFallbackPath?.key ?? null,
    latestAttemptPathLabel: latestAttempt?.label ?? runtimeFallbackPath?.label ?? null,
    behaviorChangedForReal,
    repeatedPath,
    evidenceEventIds: [
      latestAttempt?.evidenceId,
      previousAttempt?.evidenceId,
      latestRetry ? `retry:${latestRetry.id}` : null,
      input.policy ? `policy:${input.policy.id}` : null,
    ].filter((value): value is string => Boolean(value)),
  };
}

function deriveWhyDifferent(input: {
  latestRetry: RetryCheckEvent | null;
  previousAttempt: PathSnapshot | null;
  latestAttempt: PathSnapshot | null;
  policy: Policy | null;
}): string | null {
  if (input.latestRetry?.whatChanged?.trim()) {
    return input.latestRetry.whatChanged.trim();
  }

  if (
    input.previousAttempt &&
    input.latestAttempt &&
    input.previousAttempt.key !== input.latestAttempt.key
  ) {
    return `本轮路径从 ${input.previousAttempt.label} 切到 ${input.latestAttempt.label}。`;
  }

  if (input.policy?.preferredNextStep) {
    return `当前 guidance 要求：${input.policy.preferredNextStep}`;
  }

  return null;
}

function deriveRuntimeFallbackPath(runtimeEvents: GoalEngineRuntimeEvent[]): PathSnapshot | null {
  const externalToolEvent = [...runtimeEvents]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .find((event) => event.kind === 'external_tool_guard');

  if (!externalToolEvent) {
    return null;
  }

  return createPathSnapshot({
    raw: externalToolEvent.summary,
    strategyTags: [externalToolEvent.summary],
    evidenceId: `runtime:${externalToolEvent.id}`,
    timestamp: externalToolEvent.createdAt,
  });
}

function createPathSnapshot(input: {
  raw: string;
  strategyTags: string[];
  evidenceId: string;
  timestamp: string;
}): PathSnapshot {
  const label = inferPathLabel(input.raw, input.strategyTags);
  return {
    evidenceId: input.evidenceId,
    key: normalizePathKey(label),
    label,
    raw: input.raw,
    timestamp: input.timestamp,
  };
}

export function inferPathLabel(raw: string, strategyTags: string[]): string {
  const searchable = [raw, ...strategyTags].join(' | ');

  for (const entry of PATH_PATTERNS) {
    if (entry.patterns.some((pattern) => pattern.test(searchable))) {
      return entry.label;
    }
  }

  const firstTag = strategyTags.find((tag) => tag.trim().length > 0);
  if (firstTag) {
    return firstTag.trim();
  }

  const compact = raw.trim();
  if (compact.length <= 48) {
    return compact || 'unknown path';
  }

  return `${compact.slice(0, 45)}...`;
}

function normalizePathKey(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, '_');
}
