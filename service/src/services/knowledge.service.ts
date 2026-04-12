import { randomUUID } from 'node:crypto';
import type { Knowledge, KnowledgePromotion, KnowledgeVisibility } from '../../../shared/types.js';
import type { KnowledgeRepo } from '../repos/knowledge.repo.js';
import type { KnowledgePromotionRepo } from '../repos/knowledge-promotion.repo.js';

export type CreateKnowledgeFromReflectionInput = {
  agentId: string;
  goalId: string;
  attemptId: string;
  stage: string;
  actionTaken: string;
  strategyTags: string[];
  summary: string;
  rootCause: string;
  mustChange: string;
  createdAt: string;
};

export type CreateKnowledgeInput = Omit<Knowledge, 'id' | 'createdAt'> & {
  id?: string;
  createdAt?: string;
};

export type PromoteKnowledgeInput = {
  id?: string;
  knowledgeId: string;
  visibility: KnowledgeVisibility;
  agentId?: string;
  subject: string;
  condition: Record<string, unknown>;
  summary: string;
  recommendation: string;
  confidence: number;
  supportCount?: number;
  createdAt?: string;
  updatedAt?: string;
};

export class KnowledgeService {
  constructor(
    private knowledgeRepo: KnowledgeRepo,
    private promotionRepo: KnowledgePromotionRepo
  ) {}

  create(input: CreateKnowledgeInput): Knowledge {
    const knowledge: Knowledge = {
      id: input.id ?? randomUUID(),
      agentId: input.agentId,
      goalId: input.goalId,
      sourceAttemptId: input.sourceAttemptId,
      context: input.context,
      observation: input.observation,
      hypothesis: input.hypothesis,
      implication: input.implication,
      relatedStrategyTags: input.relatedStrategyTags,
      createdAt: input.createdAt ?? new Date().toISOString(),
    };
    this.knowledgeRepo.create(knowledge);
    return knowledge;
  }

  createFromReflection(input: CreateKnowledgeFromReflectionInput): Knowledge {
    return this.create({
      agentId: input.agentId,
      goalId: input.goalId,
      sourceAttemptId: input.attemptId,
      context: `Stage: ${input.stage}; action: ${input.actionTaken}`,
      observation: input.summary,
      hypothesis: input.rootCause,
      implication: input.mustChange,
      relatedStrategyTags: input.strategyTags,
      createdAt: input.createdAt,
    });
  }

  promote(input: PromoteKnowledgeInput): KnowledgePromotion {
    const now = new Date().toISOString();
    const promotion: KnowledgePromotion = {
      id: input.id ?? randomUUID(),
      knowledgeId: input.knowledgeId,
      visibility: input.visibility,
      agentId: input.agentId,
      subject: input.subject,
      condition: input.condition,
      summary: input.summary,
      recommendation: input.recommendation,
      confidence: input.confidence,
      supportCount: input.supportCount ?? 1,
      createdAt: input.createdAt ?? now,
      updatedAt: input.updatedAt ?? now,
    };
    this.promotionRepo.create(promotion);
    return promotion;
  }

  get(agentId: string, knowledgeId: string): Knowledge | null {
    return this.knowledgeRepo.getById(agentId, knowledgeId);
  }

  listByGoal(agentId: string, goalId: string, limit = 20): Knowledge[] {
    return this.knowledgeRepo.listByGoal(agentId, goalId, limit);
  }

  listRelevant(agentId: string, goalId: string, tags: string[], limit = 20): Knowledge[] {
    return this.knowledgeRepo.listByTags(agentId, goalId, tags, limit);
  }

  listSharedWisdom(agentId: string, goalId: string | undefined, subjects: string[], limit = 20): KnowledgePromotion[] {
    return this.promotionRepo.listSharedForAgent(agentId, goalId, subjects, limit);
  }
}
