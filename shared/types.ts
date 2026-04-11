import * as runtimeModule from './runtime.js';

const runtime = 'default' in runtimeModule ? runtimeModule.default : runtimeModule;

export const { FAILURE_TYPES, RETRY_GUARD_REASONS } = runtime;

export type FailureType = (typeof FAILURE_TYPES)[number];

export type RetryGuardReason = (typeof RETRY_GUARD_REASONS)[number];

export type GoalStatus = 'active' | 'blocked' | 'completed' | 'abandoned';
export type AttemptResult = 'success' | 'partial' | 'failure';

export type Goal = {
  id: string;
  agentId: string;
  title: string;
  status: GoalStatus;
  successCriteria: string[];
  stopConditions: string[];
  priority: number;
  currentStage: string;
  createdAt: string;
  updatedAt: string;
};

export type Attempt = {
  id: string;
  agentId: string;
  goalId: string;
  stage: string;
  actionTaken: string;
  strategyTags: string[];
  result: AttemptResult;
  failureType?: FailureType;
  confidence?: number;
  nextHypothesis?: string;
  createdAt: string;
};

export type Reflection = {
  id: string;
  agentId: string;
  goalId: string;
  attemptId: string;
  summary: string;
  rootCause: string;
  mustChange: string;
  avoidStrategy?: string;
  createdAt: string;
};

export type Policy = {
  id: string;
  agentId: string;
  goalId: string;
  preferredNextStep?: string;
  avoidStrategies: string[];
  mustCheckBeforeRetry: string[];
  updatedAt: string;
};

export type RecoveryPacket = {
  agentId: string;
  goalId: string;
  goalTitle: string;
  currentStage: string;
  successCriteria: string[];
  lastMeaningfulProgress?: string;
  lastFailureSummary?: string;
  avoidStrategies: string[];
  preferredNextStep?: string;
  generatedAt: string;
};

export type RetryGuardResult = {
  allowed: boolean;
  reason: RetryGuardReason;
  warnings: string[];
  tagOverlapRate?: number;
};

export type RetryCheckEvent = {
  id: string;
  agentId: string;
  goalId: string;
  plannedAction: string;
  whatChanged: string;
  strategyTags: string[];
  policyAcknowledged: boolean;
  allowed: boolean;
  reason: RetryGuardReason;
  warnings: string[];
  tagOverlapRate?: number;
  createdAt: string;
};

export type RecoveryEvent = {
  id: string;
  agentId: string;
  goalId: string;
  goalTitle: string;
  currentStage: string;
  summary: string;
  source: 'service' | 'projection';
  createdAt: string;
};

export type GoalAgentAssignment = {
  id: string;
  goalId: string;
  agentId: string;
  agentName: string;
  workspace: string;
  session: string;
  assignmentReason: 'goal_started' | 'runtime_switch' | 'session_rollover';
  assignedAt: string;
  releasedAt?: string;
};
