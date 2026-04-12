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
  /** @deprecated Prefer descriptive knowledge and retry advisories over strategy bans. */
  avoidStrategies: string[];
  mustCheckBeforeRetry: string[];
  updatedAt: string;
};

export type KnowledgeVisibility = 'private' | 'agent' | 'global';

export type Knowledge = {
  id: string;
  agentId: string;
  goalId: string;
  sourceAttemptId?: string;
  context: string;
  observation: string;
  hypothesis: string;
  implication: string;
  relatedStrategyTags: string[];
  createdAt: string;
};

export type KnowledgePromotion = {
  id: string;
  knowledgeId: string;
  visibility: KnowledgeVisibility;
  agentId?: string;
  subject: string;
  condition: Record<string, unknown>;
  summary: string;
  recommendation: string;
  confidence: number;
  supportCount: number;
  createdAt: string;
  updatedAt: string;
};

export type RecoveryPacketCurrentPolicy = {
  preferredNextStep?: string;
  mustCheckBeforeRetry: string[];
};

export type RecoveryPacketRecentAttempt = {
  id: string;
  stage: string;
  actionTaken: string;
  result: AttemptResult;
  failureType?: FailureType;
  createdAt: string;
};

export type RecoveryPacket = {
  agentId: string;
  goalId: string;
  goalTitle: string;
  currentStage: string;
  successCriteria: string[];
  lastMeaningfulProgress?: string;
  lastFailureSummary?: string;
  /** @deprecated Prefer relevantKnowledge and sharedWisdom. */
  avoidStrategies: string[];
  preferredNextStep?: string;
  recentAttempts: RecoveryPacketRecentAttempt[];
  currentPolicy?: RecoveryPacketCurrentPolicy;
  relevantKnowledge: Knowledge[];
  sharedWisdom: KnowledgePromotion[];
  openQuestions: string[];
  generatedAt: string;
};

export type RetryGuardResult = {
  allowed: boolean;
  reason: RetryGuardReason;
  warnings: string[];
  tagOverlapRate?: number;
  advisories?: string[];
  knowledgeContext?: Knowledge[];
  referencedKnowledgeIds?: string[];
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

export type KnowledgeReferenceEvent = {
  id: string;
  agentId: string;
  goalId: string;
  retryCheckEventId?: string;
  knowledgeIds: string[];
  promotionIds: string[];
  decisionSurface: 'recovery_packet' | 'retry_guard';
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
