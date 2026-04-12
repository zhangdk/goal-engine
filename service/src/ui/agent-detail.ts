import type { GoalRepo } from '../repos/goal.repo.js';
import type { AttemptRepo } from '../repos/attempt.repo.js';
import type { ReflectionRepo } from '../repos/reflection.repo.js';
import type { PolicyRepo } from '../repos/policy.repo.js';
import type { RetryHistoryRepo } from '../repos/retry-history.repo.js';
import type { RecoveryEventRepo } from '../repos/recovery-event.repo.js';
import type { GoalAgentAssignmentRepo } from '../repos/goal-agent-assignment.repo.js';
import type { RecoveryService } from '../services/recovery.service.js';
import { buildTimeline } from './timeline.js';
import { evaluateLearningVerdict } from './verdict.js';
import { deriveExecutionPathState } from './path-analysis.js';
import {
  getGoalAlignmentSnapshotByAgentId,
  getManagedOpenClawAgentById,
  getRuntimeEventsByAgentId,
  type GoalEngineRuntimeEvent,
} from './managed-openclaw-agents.js';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

type AgentDetailDependencies = {
  goalRepo: GoalRepo;
  attemptRepo: AttemptRepo;
  reflectionRepo: ReflectionRepo;
  policyRepo: PolicyRepo;
  retryHistoryRepo: RetryHistoryRepo;
  recoveryEventRepo: RecoveryEventRepo;
  goalAgentAssignmentRepo: GoalAgentAssignmentRepo;
  recoveryService: RecoveryService;
  projectionDir?: string;
  workspaceStatePath?: string;
  runtimeStatePath?: string;
};

export function buildAgentDetail(
  agentId: string,
  deps: AgentDetailDependencies
): null | {
  header: {
    agentId: string;
    name: string;
    currentGoal: string | null;
    currentGoalId: string | null;
    status: string;
    lastActiveAt: string;
    workspace: string;
    session: string;
  };
  managedStatus: {
    managed: boolean;
    reason: string;
  };
  learningVerdict: ReturnType<typeof evaluateLearningVerdict>;
  currentState: {
    goalTitle: string;
    currentStage: string;
    currentGuidance: string | null;
    avoidStrategies: string[];
    recommendedNextStep: string | null;
    currentRisk: string | null;
    lastPath: string | null;
    nextPath: string | null;
    whyDifferent: string | null;
    forbiddenPaths: string[];
  };
  goalHistory: Array<{
    goalId: string;
    goalTitle: string;
    status: string;
    currentStage: string;
    workspace: string;
    session: string;
    firstSeenAt: string;
    lastSeenAt: string;
    lastEvent: string;
  }>;
  reflectionHistory: Array<{
    id: string;
    timestamp: string;
    summary: string;
    rootCause: string;
    mustChange: string;
  }>;
  operationLog: Array<{
    id: string;
    timestamp: string;
    type: 'attempt' | 'retry_check' | 'recovery' | 'policy_update';
    title: string;
    detail: string;
  }>;
  knowledge: Array<{
    id: string;
    timestamp: string;
    context: string;
    observation: string;
    hypothesis: string;
    implication: string;
    relatedStrategyTags: string[];
  }>;
  timeline: ReturnType<typeof buildTimeline>;
  systemGaps: Array<{
    key: string;
    label: string;
    status: 'covered' | 'partial' | 'missing';
    detail: string;
  }>;
} {
  const managedAgent = getManagedOpenClawAgentById(agentId, {
    workspaceStatePath: deps.workspaceStatePath,
    runtimeStatePath: deps.runtimeStatePath,
  });
  if (!managedAgent) {
    return null;
  }

  const goal = deps.goalRepo.getCurrent(managedAgent.agentId);
  const attachedGoal =
    goal &&
    managedAgent.managed
      ? goal
      : null;
  const attempts = attachedGoal ? deps.attemptRepo.listByGoal(managedAgent.agentId, attachedGoal.id, { limit: 100 }) : [];
  const reflections = attachedGoal ? deps.reflectionRepo.listByGoal(managedAgent.agentId, attachedGoal.id) : [];
  const policy = attachedGoal ? deps.policyRepo.getByGoal(managedAgent.agentId, attachedGoal.id) : null;
  const recovery = attachedGoal ? deps.recoveryService.build(managedAgent.agentId, attachedGoal.id) : null;
  const knowledge = recovery?.relevantKnowledge ?? [];
  const retryChecks = attachedGoal ? deps.retryHistoryRepo.listByGoal(managedAgent.agentId, attachedGoal.id, 100) : [];
  const recoveryEvents = attachedGoal ? deps.recoveryEventRepo.listByGoal(managedAgent.agentId, attachedGoal.id, 100) : [];
  const goalHistory = deps.goalAgentAssignmentRepo.listGoalHistoryByAgent(managedAgent.agentId, 50);
  const goalAlignmentSnapshot = getGoalAlignmentSnapshotByAgentId(managedAgent.agentId, {
    workspaceStatePath: deps.workspaceStatePath,
    runtimeStatePath: deps.runtimeStatePath,
  });
  const runtimeEvents = getRuntimeEventsByAgentId(managedAgent.agentId, {
    workspaceStatePath: deps.workspaceStatePath,
    runtimeStatePath: deps.runtimeStatePath,
  });
  const latestRuntimeEvent = runtimeEvents[0] ?? null;
  const latestRuntimeRisk = latestRuntimeEvent && (
    latestRuntimeEvent.title === '顺序违规'
    || latestRuntimeEvent.status === 'blocked'
    || latestRuntimeEvent.status === 'warning'
  )
    ? latestRuntimeEvent
    : null;
  const latestRuntimeRiskSummary = latestRuntimeRisk?.summary ?? null;
  const persistedTimeline = buildTimeline({
    attempts,
    reflections,
    policy,
    retryChecks,
    recoveryEvents,
    knowledge,
  });
  const projectionObservations = attachedGoal
    ? buildProjectionObservations({
        goalTitle: attachedGoal.title,
        goalUpdatedAt: attachedGoal.updatedAt,
        projectionDir: deps.projectionDir,
      })
    : [];
  const alignmentObservations = buildGoalAlignmentObservations({
    snapshot: goalAlignmentSnapshot,
    attachedGoalTitle: attachedGoal?.title ?? null,
  });
  const runtimeObservations = buildRuntimeEventObservations(runtimeEvents);
  const timeline = [...runtimeObservations, ...alignmentObservations, ...projectionObservations, ...persistedTimeline]
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp));
  const executionPathState = deriveExecutionPathState({
    attempts,
    policy,
    retryChecks,
    runtimeEvents,
  });
  const verdict = evaluateLearningVerdict({
    attempts,
    reflections,
    policy,
    retryChecks,
    recoveryEvents,
    timeline,
    executionPathState,
  });
  const reflectionHistory = reflections
    .map((reflection) => ({
      id: reflection.id,
      timestamp: reflection.createdAt,
      summary: reflection.summary,
      rootCause: reflection.rootCause,
      mustChange: reflection.mustChange,
    }))
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp));
  const operationLog = [
    ...attempts.map((attempt) => ({
      id: `attempt:${attempt.id}`,
      timestamp: attempt.createdAt,
      type: 'attempt' as const,
      title: attempt.result === 'failure' ? '记录失败' : attempt.result === 'success' ? '记录成功' : '记录进展',
      detail: `${attempt.stage} · ${attempt.actionTaken}`,
    })),
    ...retryChecks.map((event) => ({
      id: `retry:${event.id}`,
      timestamp: event.createdAt,
      type: 'retry_check' as const,
      title: event.allowed ? '重试放行' : '重试阻断',
      detail: event.whatChanged
        ? `${event.plannedAction} · 变化说明：${event.whatChanged}`
        : event.plannedAction,
    })),
    ...(policy
      ? [{
          id: `policy:${policy.id}`,
          timestamp: policy.updatedAt,
          type: 'policy_update' as const,
          title: '策略更新',
          detail: policy.preferredNextStep ?? (policy.avoidStrategies.join(', ') || '当前 guidance 已更新。'),
        }]
      : []),
    ...recoveryEvents.map((event) => ({
      id: `recovery:${event.id}`,
      timestamp: event.createdAt,
      type: 'recovery' as const,
      title: '恢复上下文',
      detail: `${event.summary} · ${event.source} / ${event.currentStage}`,
    })),
  ].sort((left, right) => right.timestamp.localeCompare(left.timestamp));

  return {
    header: {
      agentId: managedAgent.agentId,
      name: managedAgent.agentName,
      currentGoal: attachedGoal?.title ?? null,
      currentGoalId: attachedGoal?.id ?? null,
      status: attachedGoal?.status ?? 'active',
      lastActiveAt: latestTimestamp([
        attachedGoal?.updatedAt,
        goalAlignmentSnapshot?.checkedAt,
        ...runtimeEvents.map((event) => event.createdAt),
        ...timeline.map((event) => event.timestamp),
        ...attempts.map((attempt) => attempt.createdAt),
        ...reflections.map((reflection) => reflection.createdAt),
        policy?.updatedAt,
      ]),
      workspace: managedAgent.workspace,
      session: managedAgent.session,
    },
    managedStatus: {
      managed: managedAgent.managed,
      reason: managedAgent.managed
        ? '这个 OpenClaw Agent 当前由 Goal Engine 托管。'
        : '这个 OpenClaw Agent 当前还没有被 Goal Engine 托管。',
    },
    learningVerdict: verdict,
    currentState: {
      goalTitle: attachedGoal?.title ?? '当前还没有活动目标',
      currentStage: attachedGoal?.currentStage ?? 'idle',
      currentGuidance: policy?.preferredNextStep ?? null,
      avoidStrategies: policy?.avoidStrategies ?? [],
      recommendedNextStep: policy?.preferredNextStep ?? null,
      lastPath: executionPathState.lastPath,
      nextPath: executionPathState.nextPath,
      whyDifferent: executionPathState.whyDifferent,
      forbiddenPaths: executionPathState.forbiddenPaths,
      currentRisk:
        verdict.overall.level === 'stalled'
          ? 'The recent history still looks repeated and stalled.'
          : latestRuntimeRiskSummary
            ? latestRuntimeRiskSummary
          : alignmentObservations.length > 0
            ? 'OpenClaw 当前任务与 service active goal 尚未对齐。'
          : projectionObservations.length > 0
            ? 'Service active goal changed, but the local projection summary is stale.'
          : attempts[0]?.result === 'failure' && !policy
            ? 'There is a recent failure but no updated guidance yet.'
            : null,
    },
    goalHistory,
    reflectionHistory,
    operationLog,
    knowledge: knowledge.map((item) => ({
      id: item.id,
      timestamp: item.createdAt,
      context: item.context,
      observation: item.observation,
      hypothesis: item.hypothesis,
      implication: item.implication,
      relatedStrategyTags: item.relatedStrategyTags,
    })),
    timeline,
    systemGaps: [
      {
        key: 'agent_goal_history',
        label: 'Agent-Goal 历史归属模型',
        status: goalHistory.length > 0 ? 'covered' : 'partial',
        detail: goalHistory.length > 0
          ? '完整归属历史已持久化：可查询 Agent 推进过的 goal、goal 归属过的 agent，以及 session rollover 连续性记录。'
          : '当前只有”active managed agent + current goal”视图，历史归属记录还很稀薄。',
      },
      {
        key: 'retry_history',
        label: '重试检查历史尚未持久化',
        status: retryChecks.length > 0 ? 'covered' : 'missing',
        detail: retryChecks.length > 0
          ? '重试检查结果已经作为历史事件保存，可以回放 Agent 如何被阻断或放行。'
          : 'UI 可以解释当前 guidance，但实时 retry check 结果还不会作为历史事件保存下来。',
      },
      {
        key: 'recovery_history',
        label: '恢复事件是实时重算的，不是事件回放',
        status: recoveryEvents.length > 0 ? 'covered' : 'missing',
        detail: recoveryEvents.length > 0
          ? 'Recovery 事件已经持久化，UI 可以展示实际发生过的恢复记录。'
          : 'Recovery 当前是从事实源实时重建，而不是读取一条持久化的恢复事件日志。',
      },
      {
        key: 'openclaw_surface',
        label: 'OpenClaw 原生 UI 还没有接入',
        status: 'partial',
        detail: '当前主实体已经是真实托管的 OpenClaw Agent，但这仍然是本地 service UI，不是 OpenClaw 内嵌的正式产品界面。',
      },
      {
        key: 'conversation_goal_alignment',
        label: '当前会话任务对齐还没有被持久化显示',
        status: 'partial',
        detail: 'UI 目前只能可靠显示 service 中的 active goal，无法直接显示 OpenClaw 对话里刚提出但尚未接管的新任务，因此仍需要人工核对“当前用户任务”和“当前 active goal”是否一致。',
      },
    ],
  };
}

function buildProjectionObservations(input: {
  goalTitle: string;
  goalUpdatedAt: string;
  projectionDir?: string;
}): Array<{
  id: string;
  timestamp: string;
  type: 'projection_notice';
  title: string;
  summary: string;
  impact: string;
  linkedIds: string[];
}> {
  if (!input.projectionDir) {
    return [];
  }

  const currentGoal = readOptional(join(input.projectionDir, 'current-goal.md'));
  const currentPolicy = readOptional(join(input.projectionDir, 'current-policy.md'));
  const recoveryPacket = readOptional(join(input.projectionDir, 'recovery-packet.md'));
  const projectionGoalTitle = extractMarkdownSection(currentGoal, '目标');
  const projectionUpdatedAt =
    extractMetadataTimestamp(currentGoal, '更新时间')
    ?? extractMetadataTimestamp(currentPolicy, '更新时间')
    ?? extractMetadataTimestamp(recoveryPacket, '生成时间')
    ?? input.goalUpdatedAt;

  if (projectionGoalTitle && projectionGoalTitle !== input.goalTitle) {
    return [
      {
        id: `projection:mismatch:${projectionUpdatedAt}`,
        timestamp: maxTimestamp([input.goalUpdatedAt, projectionUpdatedAt]),
        type: 'projection_notice',
        title: '投影未对齐',
        summary: '本地 projection 仍指向旧目标。',
        impact: `projection="${projectionGoalTitle}"，service="${input.goalTitle}"。运行 recover current goal 可重建本地摘要。`,
        linkedIds: [],
      },
    ];
  }

  const missing = [
    currentGoal ? null : 'current goal',
    currentPolicy ? null : 'current guidance',
    recoveryPacket ? null : 'recovery summary',
  ].filter((item): item is string => item !== null);

  if (missing.length > 0) {
    return [
      {
        id: `projection:missing:${input.goalUpdatedAt}`,
        timestamp: input.goalUpdatedAt,
        type: 'projection_notice',
        title: '投影缺失',
        summary: '本地 projection 还不完整。',
        impact: `缺少 ${missing.join(', ')}。运行 recover current goal 可重建本地摘要。`,
        linkedIds: [],
      },
    ];
  }

  return [];
}

function buildGoalAlignmentObservations(input: {
  snapshot: ReturnType<typeof getGoalAlignmentSnapshotByAgentId>;
  attachedGoalTitle: string | null;
}): Array<{
  id: string;
  timestamp: string;
  type: 'projection_notice';
  title: string;
  summary: string;
  impact: string;
  linkedIds: string[];
}> {
  if (!input.snapshot) {
    return [];
  }

  if (
    input.snapshot.status !== 'blocked'
    || !input.snapshot.expectedGoalTitle
    || input.snapshot.expectedGoalTitle === input.attachedGoalTitle
  ) {
    return [];
  }

  return [
    {
      id: `alignment:blocked:${input.snapshot.checkedAt}`,
      timestamp: input.snapshot.checkedAt,
      type: 'projection_notice',
      title: '目标未对齐',
      summary: 'OpenClaw 当前任务与 active goal 不一致。',
      impact: [
        `expected="${input.snapshot.expectedGoalTitle}"`,
        `service="${input.snapshot.activeGoalTitle ?? '无 active goal'}"`,
        input.snapshot.projectionGoalTitle
          ? `projection="${input.snapshot.projectionGoalTitle}"`
          : null,
        `next="${input.snapshot.nextAction}"`,
      ].filter(Boolean).join('，'),
      linkedIds: [],
    },
  ];
}

function buildRuntimeEventObservations(
  runtimeEvents: GoalEngineRuntimeEvent[]
): Array<{
  id: string;
  timestamp: string;
  type: 'runtime_signal';
  title: string;
  summary: string;
  impact: string;
  linkedIds: string[];
}> {
  return runtimeEvents.map((event) => ({
    id: `runtime:${event.id}`,
    timestamp: event.createdAt,
    type: 'runtime_signal',
    title: event.title,
    summary: event.summary,
    impact: event.detail ?? resolveRuntimeEventImpact(event),
    linkedIds: [],
  }));
}

function resolveRuntimeEventImpact(event: GoalEngineRuntimeEvent): string {
  switch (event.kind) {
    case 'show_goal_status':
      return event.status === 'blocked'
        ? '当前轮必须先完成 goal 对齐，不能继续外部搜索。'
        : 'Goal Engine 已返回当前 goal 对齐状态。';
    case 'start_goal':
      return '新的 active goal 已经通过 Goal Engine 启动。';
    case 'record_failed_attempt':
      return '这次失败已经写入 Goal Engine，可驱动下一轮 guidance。';
    case 'recover_current_goal':
      return 'OpenClaw 显式请求恢复当前 goal 上下文。';
    case 'check_retry':
      return event.status === 'warning'
        ? 'Goal Engine 阻止了重复路径。'
        : 'Goal Engine 已检查这次重试是否可放行。';
    case 'bootstrap':
      return '当前 OpenClaw 会话已经与 Goal Engine runtime 建立桥接。';
    case 'external_tool_guard':
      return 'Goal Engine 拦住了一次外部工具调用。';
    default:
      return 'Goal Engine 运行事件。';
  }
}

function readOptional(path: string): string | undefined {
  if (!existsSync(path)) {
    return undefined;
  }

  return readFileSync(path, 'utf-8');
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
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('>'));

  if (lines.length === 0) {
    return undefined;
  }

  return lines.join(' ');
}

function extractMetadataTimestamp(markdown: string | undefined, label: string): string | undefined {
  if (!markdown) {
    return undefined;
  }

  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = markdown.match(new RegExp(`>\\s*${escapedLabel}：([^\\n]+)`));
  return match?.[1]?.trim() || undefined;
}

function maxTimestamp(values: string[]): string {
  return values.sort((left, right) => right.localeCompare(left))[0] ?? '暂无活动';
}

export function formatAgentName(agentId: string): string {
  return `智能体 ${agentId.slice(0, 8)}`;
}

function latestTimestamp(values: Array<string | null | undefined>): string {
  return (
    values.filter(Boolean).sort((left, right) => String(right).localeCompare(String(left)))[0] ??
    '暂无活动'
  );
}
