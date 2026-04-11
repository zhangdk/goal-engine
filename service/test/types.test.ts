import { describe, expect, it } from 'vitest';
import {
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
});
