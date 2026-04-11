import type {
  Attempt,
  Policy,
  RecoveryEvent,
  Reflection,
  RetryCheckEvent,
  Knowledge,
} from '../../../shared/types.js';

export type TimelineEventType =
  | 'failure'
  | 'reflection'
  | 'policy_update'
  | 'retry_check'
  | 'recovery'
  | 'knowledge'
  | 'progress'
  | 'projection_notice'
  | 'runtime_signal';

export type TimelineEvent = {
  id: string;
  timestamp: string;
  type: TimelineEventType;
  title: string;
  summary: string;
  impact: string;
  linkedIds: string[];
};

type TimelineInput = {
  attempts: Attempt[];
  reflections: Reflection[];
  policy: Policy | null;
  retryChecks: RetryCheckEvent[];
  recoveryEvents: RecoveryEvent[];
  knowledge: Knowledge[];
};

export function buildTimeline(input: TimelineInput): TimelineEvent[] {
  const reflectionByAttemptId = new Map(
    input.reflections.map((reflection) => [reflection.attemptId, reflection])
  );

  const attemptEvents: TimelineEvent[] = input.attempts.flatMap<TimelineEvent>((attempt) => {
    const linkedReflection = reflectionByAttemptId.get(attempt.id);
    const baseLinkedIds = linkedReflection ? [`reflection:${linkedReflection.id}`] : [];

    if (attempt.result === 'failure') {
      return [
        {
          id: `failure:${attempt.id}`,
          timestamp: attempt.createdAt,
          type: 'failure' as const,
          title: '失败',
          summary: attempt.actionTaken,
          impact: attempt.failureType
            ? `失败类型：${attempt.failureType}`
            : '这条失败路径已经进入 Agent 的历史上下文。',
          linkedIds: baseLinkedIds,
        },
      ];
    }

    return [
      {
        id: `progress:${attempt.id}`,
        timestamp: attempt.createdAt,
        type: 'progress' as const,
        title: attempt.result === 'success' ? '成功' : '进展',
        summary: attempt.actionTaken,
        impact:
          attempt.result === 'success'
            ? 'Agent 在改变路径后取得了成功进展。'
            : 'Agent 在改变路径后取得了部分进展。',
        linkedIds: [],
      },
    ];
  });

  const reflectionEvents: TimelineEvent[] = input.reflections.map((reflection) => ({
    id: `reflection:${reflection.id}`,
    timestamp: reflection.createdAt,
    type: 'reflection' as const,
    title: '反思',
    summary: reflection.summary,
    impact: `根因：${reflection.rootCause}。必须改变：${reflection.mustChange}`,
    linkedIds: [`failure:${reflection.attemptId}`],
  }));

  const policyEvents: TimelineEvent[] = input.policy
    ? [
        {
          id: `policy:${input.policy.id}`,
          timestamp: input.policy.updatedAt,
          type: 'policy_update' as const,
          title: '策略更新',
          summary:
            input.policy.preferredNextStep ??
            (input.policy.avoidStrategies.length > 0
              ? `避免：${input.policy.avoidStrategies.join(', ')}`
              : '当前 guidance 已更新。'),
          impact:
            input.policy.avoidStrategies.length > 0
              ? `避免策略：${input.policy.avoidStrategies.join(', ')}`
              : '当前 guidance 已发生变化。',
          linkedIds: input.reflections.length
            ? [`reflection:${input.reflections[input.reflections.length - 1]!.id}`]
            : [],
        },
      ]
    : [];

  const retryCheckEvents: TimelineEvent[] = input.retryChecks.map((event) => ({
    id: `retry:${event.id}`,
    timestamp: event.createdAt,
    type: 'retry_check' as const,
    title: event.allowed ? '重试放行' : '重试阻断',
    summary: event.plannedAction,
    impact: [
      event.reason,
      event.whatChanged ? `变化说明：${event.whatChanged}` : null,
    ].filter(Boolean).join(' | '),
    linkedIds: input.policy ? [`policy:${input.policy.id}`] : [],
  }));

  const recoveryEvents: TimelineEvent[] = input.recoveryEvents.map((event) => ({
    id: `recovery:${event.id}`,
    timestamp: event.createdAt,
    type: 'recovery' as const,
    title: '恢复',
    summary: event.summary,
    impact: `来源：${event.source} | 阶段：${event.currentStage}`,
    linkedIds: [],
  }));

  const knowledgeEvents: TimelineEvent[] = input.knowledge.map((knowledge) => ({
    id: `knowledge:${knowledge.id}`,
    timestamp: knowledge.createdAt,
    type: 'knowledge' as const,
    title: '认知',
    summary: knowledge.observation,
    impact: `可能原因：${knowledge.hypothesis}。下一步：${knowledge.implication}`,
    linkedIds: knowledge.sourceAttemptId ? [`failure:${knowledge.sourceAttemptId}`] : [],
  }));

  return [...attemptEvents, ...reflectionEvents, ...policyEvents, ...retryCheckEvents, ...recoveryEvents, ...knowledgeEvents].sort(
    (left: TimelineEvent, right: TimelineEvent) => right.timestamp.localeCompare(left.timestamp)
  );
}
