import { describe, expect, it } from 'vitest';
import {
  type Knowledge,
  type KnowledgePromotion,
  type RecoveryPacket,
  type RetryGuardResult,
  type FailureType,
  type RetryGuardReason
} from '../../shared/types.js';
import * as runtimeModule from '../../shared/runtime.js';

const runtime = 'default' in runtimeModule ? runtimeModule.default : runtimeModule;
const { FAILURE_TYPES, RETRY_GUARD_REASONS } = runtime;

describe('shared frozen enums', () => {
  it('freezes FailureType to the v0 baseline values', () => {
    const expected: FailureType[] = [
      'tool_error',
      'capability_gap',
      'strategy_mismatch',
      'external_blocker',
      'resource_limit',
      'validation_fail',
      'stuck_loop',
      'ambiguous_goal'
    ];

    expect(FAILURE_TYPES).toEqual(expected);
  });

  it('freezes RetryGuardReason to the v0 baseline values', () => {
    const expected: RetryGuardReason[] = [
      'allowed',
      'policy_not_acknowledged',
      'blocked_strategy_overlap',
      'no_meaningful_change',
      'repeated_failure_without_downgrade'
    ];

    expect(RETRY_GUARD_REASONS).toEqual(expected);
  });

  it('keeps historical blocked strategy reason available for existing retry events', () => {
    expect(RETRY_GUARD_REASONS).toContain('blocked_strategy_overlap');
  });

  it('models descriptive knowledge and injected retry advisories', () => {
    const knowledge: Knowledge = {
      id: 'know_1',
      agentId: 'agent-a',
      goalId: 'goal-a',
      sourceAttemptId: 'attempt-a',
      context: 'search stage with broad web search',
      observation: 'results were stale',
      hypothesis: 'aggregators lag official sources',
      implication: 'prefer official source checks before another aggregator pass',
      relatedStrategyTags: ['event_search'],
      createdAt: '2026-04-11T00:00:00.000Z'
    };

    const promotion: KnowledgePromotion = {
      id: 'promo_1',
      knowledgeId: knowledge.id,
      visibility: 'agent',
      agentId: 'agent-a',
      subject: 'event_search',
      condition: { stage: 'search' },
      summary: 'Official sources are more reliable than aggregators.',
      recommendation: 'Check organizer pages before another aggregator pass.',
      confidence: 0.7,
      supportCount: 1,
      createdAt: knowledge.createdAt,
      updatedAt: knowledge.createdAt
    };

    const packet: RecoveryPacket = {
      agentId: 'agent-a',
      goalId: 'goal-a',
      goalTitle: 'Find an event',
      currentStage: 'search',
      successCriteria: ['Find one real event'],
      lastMeaningfulProgress: undefined,
      lastFailureSummary: 'aggregator returned stale links',
      avoidStrategies: [],
      preferredNextStep: 'Check official pages',
      recentAttempts: [],
      currentPolicy: {
        preferredNextStep: 'Check official pages',
        mustCheckBeforeRetry: ['Compare with previous path']
      },
      relevantKnowledge: [knowledge],
      sharedWisdom: [promotion],
      openQuestions: ['Which organizer pages are authoritative?'],
      generatedAt: knowledge.createdAt
    };

    const retryResult: RetryGuardResult = {
      allowed: true,
      reason: 'allowed',
      warnings: ['Strategy overlaps prior avoid_strategy; treat as risk, not a block.'],
      advisories: ['Prefer official source checks before another aggregator pass.'],
      knowledgeContext: [knowledge],
      referencedKnowledgeIds: [knowledge.id]
    };

    expect(packet.relevantKnowledge[0].id).toBe('know_1');
    expect(retryResult.allowed).toBe(true);
  });
});
