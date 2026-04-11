export const FAILURE_TYPES = [
  'tool_error',
  'capability_gap',
  'strategy_mismatch',
  'external_blocker',
  'resource_limit',
  'validation_fail',
  'stuck_loop',
  'ambiguous_goal',
];

export const RETRY_GUARD_REASONS = [
  'allowed',
  'policy_not_acknowledged',
  'blocked_strategy_overlap',
  'no_meaningful_change',
  'repeated_failure_without_downgrade',
];
