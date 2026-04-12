import type { AdapterClient } from '../client.js';
import type {
  Knowledge,
  KnowledgePromotion,
  KnowledgeVisibility,
  RecoveryPacket,
  RecoveryPacketCurrentPolicy,
  RecoveryPacketRecentAttempt,
} from '../../../shared/types.js';

type RecoverySnake = {
  agent_id?: string;
  goal_id: string;
  goal_title: string;
  current_stage: string;
  success_criteria: string[];
  last_meaningful_progress?: string;
  last_failure_summary?: string;
  avoid_strategies: string[];
  preferred_next_step?: string;
  current_policy?: {
    preferred_next_step?: string;
    must_check_before_retry: string[];
  };
  recent_attempts?: Array<{
    id: string;
    stage: string;
    action_taken: string;
    result: 'success' | 'partial' | 'failure';
    failure_type?: RecoveryPacketRecentAttempt['failureType'];
    created_at: string;
  }>;
  relevant_knowledge?: Array<{
    id: string;
    agent_id?: string;
    goal_id: string;
    source_attempt_id?: string;
    context: string;
    observation: string;
    hypothesis: string;
    implication: string;
    related_strategy_tags: string[];
    created_at: string;
  }>;
  shared_wisdom?: Array<{
    id: string;
    knowledge_id: string;
    visibility: KnowledgeVisibility;
    agent_id?: string;
    subject: string;
    condition: Record<string, unknown>;
    summary: string;
    recommendation: string;
    confidence: number;
    support_count: number;
    created_at: string;
    updated_at: string;
  }>;
  open_questions?: string[];
  generated_at: string;
};

function toCamel(raw: RecoverySnake): RecoveryPacket {
  return {
    agentId: raw.agent_id ?? 'goal-engine-demo',
    goalId: raw.goal_id,
    goalTitle: raw.goal_title,
    currentStage: raw.current_stage,
    successCriteria: raw.success_criteria,
    lastMeaningfulProgress: raw.last_meaningful_progress,
    lastFailureSummary: raw.last_failure_summary,
    avoidStrategies: raw.avoid_strategies,
    preferredNextStep: raw.preferred_next_step,
    currentPolicy: raw.current_policy ? policyToCamel(raw.current_policy) : undefined,
    recentAttempts: (raw.recent_attempts ?? []).map(attemptToCamel),
    relevantKnowledge: (raw.relevant_knowledge ?? []).map(knowledgeToCamel),
    sharedWisdom: (raw.shared_wisdom ?? []).map(promotionToCamel),
    openQuestions: raw.open_questions ?? [],
    generatedAt: raw.generated_at,
  };
}

function policyToCamel(raw: {
  preferred_next_step?: string;
  must_check_before_retry: string[];
}): RecoveryPacketCurrentPolicy {
  return {
    preferredNextStep: raw.preferred_next_step,
    mustCheckBeforeRetry: raw.must_check_before_retry,
  };
}

function attemptToCamel(raw: NonNullable<RecoverySnake['recent_attempts']>[number]): RecoveryPacketRecentAttempt {
  return {
    id: raw.id,
    stage: raw.stage,
    actionTaken: raw.action_taken,
    result: raw.result,
    failureType: raw.failure_type,
    createdAt: raw.created_at,
  };
}

function knowledgeToCamel(raw: NonNullable<RecoverySnake['relevant_knowledge']>[number]): Knowledge {
  return {
    id: raw.id,
    agentId: raw.agent_id ?? 'goal-engine-demo',
    goalId: raw.goal_id,
    sourceAttemptId: raw.source_attempt_id,
    context: raw.context,
    observation: raw.observation,
    hypothesis: raw.hypothesis,
    implication: raw.implication,
    relatedStrategyTags: raw.related_strategy_tags,
    createdAt: raw.created_at,
  };
}

function promotionToCamel(raw: NonNullable<RecoverySnake['shared_wisdom']>[number]): KnowledgePromotion {
  return {
    id: raw.id,
    knowledgeId: raw.knowledge_id,
    visibility: raw.visibility,
    agentId: raw.agent_id,
    subject: raw.subject,
    condition: raw.condition,
    summary: raw.summary,
    recommendation: raw.recommendation,
    confidence: raw.confidence,
    supportCount: raw.support_count,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  };
}

export async function recoveryPacketGet(
  client: AdapterClient,
  goalId: string,
  options?: {
    source?: 'service' | 'projection';
  }
): Promise<RecoveryPacket> {
  const params = new URLSearchParams({
    goal_id: goalId,
  });
  if (options?.source) {
    params.set('source', options.source);
  }

  const raw = await client.get<RecoverySnake>(
    `/api/v1/recovery-packet?${params.toString()}`
  );
  return toCamel(raw);
}
