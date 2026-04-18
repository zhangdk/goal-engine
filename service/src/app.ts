import { Hono } from 'hono';
import type Database from 'better-sqlite3';
import { InvalidAgentIdError } from './agent-context.js';
import { GoalRepo } from './repos/goal.repo.js';
import { AttemptRepo } from './repos/attempt.repo.js';
import { ReflectionRepo } from './repos/reflection.repo.js';
import { PolicyRepo } from './repos/policy.repo.js';
import { RetryHistoryRepo } from './repos/retry-history.repo.js';
import { RecoveryEventRepo } from './repos/recovery-event.repo.js';
import { GoalAgentAssignmentRepo } from './repos/goal-agent-assignment.repo.js';
import { GoalContractRepo } from './repos/goal-contract.repo.js';
import { AttemptEvidenceRepo } from './repos/attempt-evidence.repo.js';
import { GoalCompletionRepo } from './repos/goal-completion.repo.js';
import { KnowledgeRepo } from './repos/knowledge.repo.js';
import { KnowledgePromotionRepo } from './repos/knowledge-promotion.repo.js';
import { KnowledgeReferenceEventRepo } from './repos/knowledge-reference-event.repo.js';
import { PolicyService } from './services/policy.service.js';
import { RecoveryService } from './services/recovery.service.js';
import { GoalAgentHistoryService } from './services/goal-agent-history.service.js';
import { KnowledgeService } from './services/knowledge.service.js';
import { goalsRouter } from './routes/goals.js';
import { attemptsRouter } from './routes/attempts.js';
import { evidenceRouter } from './routes/evidence.js';
import { reflectionsRouter } from './routes/reflections.js';
import { policiesRouter } from './routes/policies.js';
import { retryGuardRouter } from './routes/retry-guard.js';
import { recoveryRouter } from './routes/recovery.js';
import { knowledgeRouter } from './routes/knowledge.js';
import { healthRouter } from './routes/health.js';
import { uiApiRouter, uiPageRouter } from './routes/ui.js';

type CreateAppOptions = {
  ui?: {
    projectionDir?: string;
    workspaceStatePath?: string;
    runtimeStatePath?: string;
  };
};

export function createApp(db: Database.Database, options?: CreateAppOptions): Hono {
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof InvalidAgentIdError) {
      return c.json({
        error: {
          code: 'validation_error',
          message: err.message,
        },
      }, 422);
    }
    throw err;
  });

  // Repos
  const goalRepo = new GoalRepo(db);
  const attemptRepo = new AttemptRepo(db);
  const reflectionRepo = new ReflectionRepo(db);
  const policyRepo = new PolicyRepo(db);
  const retryHistoryRepo = new RetryHistoryRepo(db);
  const recoveryEventRepo = new RecoveryEventRepo(db);
  const goalAgentAssignmentRepo = new GoalAgentAssignmentRepo(db);
  const goalContractRepo = new GoalContractRepo(db);
  const attemptEvidenceRepo = new AttemptEvidenceRepo(db);
  const goalCompletionRepo = new GoalCompletionRepo(db);
  const knowledgeRepo = new KnowledgeRepo(db);
  const knowledgePromotionRepo = new KnowledgePromotionRepo(db);
  const knowledgeReferenceEventRepo = new KnowledgeReferenceEventRepo(db);

  // Services
  const knowledgeService = new KnowledgeService(knowledgeRepo, knowledgePromotionRepo);
  const policyService = new PolicyService(db, goalRepo, attemptRepo, reflectionRepo, policyRepo, knowledgeService);
  const recoveryService = new RecoveryService(
    goalRepo,
    attemptRepo,
    policyRepo,
    goalContractRepo,
    goalCompletionRepo,
    knowledgeService
  );
  const goalAgentHistoryService = new GoalAgentHistoryService(goalRepo, goalAgentAssignmentRepo, {
    workspaceStatePath: options?.ui?.workspaceStatePath,
    runtimeStatePath: options?.ui?.runtimeStatePath,
  });

  // Routes under /api/v1
  app.route('/api/v1/goals', goalsRouter(
    db,
    goalRepo,
    goalAgentAssignmentRepo,
    goalAgentHistoryService,
    goalContractRepo,
    attemptEvidenceRepo,
    goalCompletionRepo
  ));
  app.route('/api/v1/evidence', evidenceRouter(goalRepo, attemptRepo, attemptEvidenceRepo));
  app.route('/api/v1/attempts', attemptsRouter(goalRepo, attemptRepo, goalAgentHistoryService));
  app.route('/api/v1/reflections', reflectionsRouter(policyService, attemptRepo, goalAgentHistoryService));
  app.route('/api/v1/policies', policiesRouter(goalRepo, policyRepo));
  app.route('/api/v1/retry-guard', retryGuardRouter(
    goalRepo,
    policyRepo,
    attemptRepo,
    retryHistoryRepo,
    knowledgeService,
    knowledgeReferenceEventRepo,
    goalAgentHistoryService
  ));
  app.route('/api/v1/recovery-packet', recoveryRouter(
    recoveryService,
    recoveryEventRepo,
    knowledgeReferenceEventRepo,
    goalAgentHistoryService
  ));
  app.route('/api/v1/knowledge', knowledgeRouter(goalRepo, attemptRepo, knowledgeService));
  app.route('/api/v1/health', healthRouter());
  app.route('/api/v1/ui', uiApiRouter(goalRepo, attemptRepo, reflectionRepo, policyRepo, retryHistoryRepo, recoveryEventRepo, goalAgentAssignmentRepo, goalAgentHistoryService, recoveryService, {
    projectionDir: options?.ui?.projectionDir,
    workspaceStatePath: options?.ui?.workspaceStatePath,
    runtimeStatePath: options?.ui?.runtimeStatePath,
  }));
  app.route('/ui', uiPageRouter());

  return app;
}
