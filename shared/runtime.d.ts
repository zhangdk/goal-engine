export const FAILURE_TYPES: readonly [
  'tool_error',
  'capability_gap',
  'strategy_mismatch',
  'external_blocker',
  'resource_limit',
  'validation_fail',
  'stuck_loop',
  'ambiguous_goal'
];

export const RETRY_GUARD_REASONS: readonly [
  'allowed',
  'policy_not_acknowledged',
  'blocked_strategy_overlap',
  'no_meaningful_change',
  'repeated_failure_without_downgrade'
];

declare const runtime: {
  FAILURE_TYPES: typeof FAILURE_TYPES;
  RETRY_GUARD_REASONS: typeof RETRY_GUARD_REASONS;
};

export default runtime;
