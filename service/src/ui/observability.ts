import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { GoalRepo } from '../repos/goal.repo.js';
import type { AttemptRepo } from '../repos/attempt.repo.js';
import type { ReflectionRepo } from '../repos/reflection.repo.js';
import type { PolicyRepo } from '../repos/policy.repo.js';
import type { RecoveryService } from '../services/recovery.service.js';
import { currentMvpIntent, originalIntent, type RequirementCard } from './requirements.js';
import { DEFAULT_AGENT_ID } from '../agent-context.js';

export type AuditStatus = 'covered' | 'partial' | 'missing';

export type ObservabilityView = {
  originalIntent: RequirementCard[];
  currentMvpIntent: RequirementCard[];
  implementationStatus: {
    activeGoal: null | {
      id: string;
      title: string;
      status: string;
      currentStage: string;
      successCriteria: string[];
      updatedAt: string;
    };
    currentGuidance: null | {
      id: string;
      goalId: string;
      preferredNextStep?: string;
      avoidStrategies: string[];
      mustCheckBeforeRetry: string[];
      updatedAt: string;
    };
    latestFailure: null | {
      id: string;
      stage: string;
      actionTaken: string;
      strategyTags: string[];
      failureType?: string;
      createdAt: string;
    };
    latestReflection: null | {
      id: string;
      attemptId: string;
      summary: string;
      rootCause: string;
      mustChange: string;
      avoidStrategy?: string;
      createdAt: string;
    };
    currentRecovery: null | {
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
    projectionReady: boolean;
  };
  gapAudit: AuditItem[];
};

export type AuditItem = {
  source: 'prd' | 'mvp';
  requirement: string;
  status: AuditStatus;
  evidence: string;
  notes?: string;
};

export type ObservabilityDependencies = {
  goalRepo: GoalRepo;
  attemptRepo: AttemptRepo;
  reflectionRepo: ReflectionRepo;
  policyRepo: PolicyRepo;
  recoveryService: RecoveryService;
  projectionDir?: string;
};

const defaultProjectionDir = resolve(process.cwd(), '..', 'examples', 'workspace', 'goal-engine');
const projectionFiles = ['current-goal.md', 'current-policy.md', 'recovery-packet.md'] as const;

export function buildObservabilityView(deps: ObservabilityDependencies): ObservabilityView {
  const projectionDir = deps.projectionDir ?? defaultProjectionDir;
  const activeGoal = deps.goalRepo.getCurrent(DEFAULT_AGENT_ID);
  const currentGuidance = activeGoal ? deps.policyRepo.getByGoal(DEFAULT_AGENT_ID, activeGoal.id) : null;
  const latestFailure = activeGoal ? deps.attemptRepo.getLatestFailure(DEFAULT_AGENT_ID, activeGoal.id) : null;
  const latestReflection = activeGoal ? deps.reflectionRepo.getLatest(DEFAULT_AGENT_ID, activeGoal.id) : null;
  const currentRecovery = activeGoal ? deps.recoveryService.build(DEFAULT_AGENT_ID, activeGoal.id) : null;
  const projectionReady = projectionFiles.every((filename) => existsSync(join(projectionDir, filename)));

  return {
    originalIntent,
    currentMvpIntent,
    implementationStatus: {
      activeGoal: activeGoal
        ? {
            id: activeGoal.id,
            title: activeGoal.title,
            status: activeGoal.status,
            currentStage: activeGoal.currentStage,
            successCriteria: activeGoal.successCriteria,
            updatedAt: activeGoal.updatedAt,
          }
        : null,
      currentGuidance: currentGuidance
        ? {
            id: currentGuidance.id,
            goalId: currentGuidance.goalId,
            preferredNextStep: currentGuidance.preferredNextStep,
            avoidStrategies: currentGuidance.avoidStrategies,
            mustCheckBeforeRetry: currentGuidance.mustCheckBeforeRetry,
            updatedAt: currentGuidance.updatedAt,
          }
        : null,
      latestFailure: latestFailure
        ? {
            id: latestFailure.id,
            stage: latestFailure.stage,
            actionTaken: latestFailure.actionTaken,
            strategyTags: latestFailure.strategyTags,
            failureType: latestFailure.failureType,
            createdAt: latestFailure.createdAt,
          }
        : null,
      latestReflection: latestReflection
        ? {
            id: latestReflection.id,
            attemptId: latestReflection.attemptId,
            summary: latestReflection.summary,
            rootCause: latestReflection.rootCause,
            mustChange: latestReflection.mustChange,
            avoidStrategy: latestReflection.avoidStrategy,
            createdAt: latestReflection.createdAt,
          }
        : null,
      currentRecovery: currentRecovery
        ? {
            goalId: currentRecovery.goalId,
            goalTitle: currentRecovery.goalTitle,
            currentStage: currentRecovery.currentStage,
            successCriteria: currentRecovery.successCriteria,
            lastMeaningfulProgress: currentRecovery.lastMeaningfulProgress,
            lastFailureSummary: currentRecovery.lastFailureSummary,
            avoidStrategies: currentRecovery.avoidStrategies,
            preferredNextStep: currentRecovery.preferredNextStep,
            generatedAt: currentRecovery.generatedAt,
          }
        : null,
      projectionReady,
    },
    gapAudit: buildGapAudit({
      hasActiveGoal: activeGoal !== null,
      hasGuidance: currentGuidance !== null,
      hasReflection: latestReflection !== null,
      hasRecovery: currentRecovery !== null,
      projectionReady,
    }),
  };
}

function buildGapAudit(input: {
  hasActiveGoal: boolean;
  hasGuidance: boolean;
  hasReflection: boolean;
  hasRecovery: boolean;
  projectionReady: boolean;
}): AuditItem[] {
  return [
    {
      source: 'prd',
      requirement: 'Long-term goal state exists',
      status: 'covered',
      evidence: input.hasActiveGoal
        ? 'Active goal can be read from the persisted service fact source.'
        : 'Goal persistence exists, but there is no active goal right now.',
      notes: 'Capability exists even when the current state is empty.',
    },
    {
      source: 'prd',
      requirement: 'Failure can become updated guidance',
      status: input.hasGuidance && input.hasReflection ? 'covered' : 'partial',
      evidence: input.hasGuidance && input.hasReflection
        ? 'Latest failed attempt has a reflection and the policy now carries updated guidance.'
        : 'Reflection-driven policy update exists, but there is no live reflected failure for the current goal.',
    },
    {
      source: 'prd',
      requirement: 'Repeat path can be blocked',
      status: 'partial',
      evidence: 'The retry guard can block a repeated path live, but the result is not persisted as history.',
      notes: 'This UI can only show live retry-check results, not stored retry events.',
    },
    {
      source: 'mvp',
      requirement: 'Current recovery snapshot is available',
      status: input.hasRecovery ? 'covered' : 'partial',
      evidence: input.hasRecovery
        ? 'Recovery packet is derived live from goal, attempts, and policy facts.'
        : 'Recovery packet route exists, but there is no active goal to derive a snapshot from.',
    },
    {
      source: 'mvp',
      requirement: 'Projection readiness is observable',
      status: 'covered',
      evidence: input.projectionReady
        ? 'Expected projection files are present and observable from the local workspace.'
        : 'Expected projection files are missing, and the UI exposes that directly.',
    },
    {
      source: 'mvp',
      requirement: 'Retry-check history is persisted',
      status: 'missing',
      evidence: 'No table or event log stores retry-check history today.',
    },
    {
      source: 'mvp',
      requirement: 'Recovery event history is persisted',
      status: 'missing',
      evidence: 'Recovery is recomputed from current facts; recovery events are not persisted.',
    },
    {
      source: 'mvp',
      requirement: 'OpenClaw-specific UI surface exists',
      status: 'missing',
      evidence: 'This page is a local observability surface on the service, not an OpenClaw-integrated user UI.',
    },
  ];
}
