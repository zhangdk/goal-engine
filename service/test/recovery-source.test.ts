import { describe, it, expect } from 'vitest';
import { buildTimeline } from '../src/ui/timeline.js';
import type { RecoveryEvent, Attempt, Reflection, Policy, RetryCheckEvent } from '../../shared/types.js';

function emptyInput() {
  return {
    attempts: [] as Attempt[],
    reflections: [] as Reflection[],
    policy: null as Policy | null,
    retryChecks: [] as RetryCheckEvent[],
    recoveryEvents: [] as RecoveryEvent[],
  };
}

describe('recovery source in timeline', () => {
  it('shows "service" source in recovery event impact', () => {
    const input = {
      ...emptyInput(),
      recoveryEvents: [
        {
          id: 'rec-1',
          agentId: 'goal-engine-demo',
          goalId: 'g-1',
          goalTitle: '测试目标',
          currentStage: 'research',
          summary: '已恢复 测试目标',
          source: 'service' as const,
          createdAt: '2026-04-06T10:00:00.000Z',
        },
      ],
    };

    const timeline = buildTimeline(input);
    const recoveryEvent = timeline.find((e) => e.id === 'recovery:rec-1');

    expect(recoveryEvent).toBeDefined();
    expect(recoveryEvent!.impact).toContain('service');
    expect(recoveryEvent!.type).toBe('recovery');
  });

  it('shows "projection" source in recovery event impact', () => {
    const input = {
      ...emptyInput(),
      recoveryEvents: [
        {
          id: 'rec-2',
          agentId: 'goal-engine-demo',
          goalId: 'g-1',
          goalTitle: '测试目标',
          currentStage: 'execution',
          summary: '已恢复 测试目标',
          source: 'projection' as const,
          createdAt: '2026-04-06T11:00:00.000Z',
        },
      ],
    };

    const timeline = buildTimeline(input);
    const recoveryEvent = timeline.find((e) => e.id === 'recovery:rec-2');

    expect(recoveryEvent).toBeDefined();
    expect(recoveryEvent!.impact).toContain('projection');
  });

  it('distinguishes service and projection recovery events in timeline', () => {
    const input = {
      ...emptyInput(),
      recoveryEvents: [
        {
          id: 'rec-service',
          agentId: 'goal-engine-demo',
          goalId: 'g-1',
          goalTitle: '目标A',
          currentStage: 'research',
          summary: '从 service 恢复',
          source: 'service' as const,
          createdAt: '2026-04-06T10:00:00.000Z',
        },
        {
          id: 'rec-projection',
          agentId: 'goal-engine-demo',
          goalId: 'g-1',
          goalTitle: '目标A',
          currentStage: 'research',
          summary: '从 projection 恢复',
          source: 'projection' as const,
          createdAt: '2026-04-06T11:00:00.000Z',
        },
      ],
    };

    const timeline = buildTimeline(input);
    const serviceEvent = timeline.find((e) => e.id === 'recovery:rec-service')!;
    const projectionEvent = timeline.find((e) => e.id === 'recovery:rec-projection')!;

    expect(serviceEvent.impact).toContain('service');
    expect(serviceEvent.impact).not.toContain('projection');
    expect(projectionEvent.impact).toContain('projection');
    expect(projectionEvent.impact).not.toContain('service');
  });
});
