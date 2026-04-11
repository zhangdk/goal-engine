import { Hono } from 'hono';
import type Database from 'better-sqlite3';
import { GoalRepo } from './repos/goal.repo.js';
import { AttemptRepo } from './repos/attempt.repo.js';
import { ReflectionRepo } from './repos/reflection.repo.js';
import { PolicyRepo } from './repos/policy.repo.js';
import { RetryHistoryRepo } from './repos/retry-history.repo.js';
import { RecoveryEventRepo } from './repos/recovery-event.repo.js';
import { GoalAgentAssignmentRepo } from './repos/goal-agent-assignment.repo.js';
import { PolicyService } from './services/policy.service.js';
import { RecoveryService } from './services/recovery.service.js';
import { GoalAgentHistoryService } from './services/goal-agent-history.service.js';
import { goalsRouter } from './routes/goals.js';
import { attemptsRouter } from './routes/attempts.js';
import { reflectionsRouter } from './routes/reflections.js';
import { policiesRouter } from './routes/policies.js';
import { retryGuardRouter } from './routes/retry-guard.js';
import { recoveryRouter } from './routes/recovery.js';
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

  // Repos
  const goalRepo = new GoalRepo(db);
  const attemptRepo = new AttemptRepo(db);
  const reflectionRepo = new ReflectionRepo(db);
  const policyRepo = new PolicyRepo(db);
  const retryHistoryRepo = new RetryHistoryRepo(db);
  const recoveryEventRepo = new RecoveryEventRepo(db);
  const goalAgentAssignmentRepo = new GoalAgentAssignmentRepo(db);

  // Services
  const policyService = new PolicyService(db, goalRepo, attemptRepo, reflectionRepo, policyRepo);
  const recoveryService = new RecoveryService(goalRepo, attemptRepo, policyRepo);
  const goalAgentHistoryService = new GoalAgentHistoryService(goalRepo, goalAgentAssignmentRepo, {
    workspaceStatePath: options?.ui?.workspaceStatePath,
    runtimeStatePath: options?.ui?.runtimeStatePath,
  });

  // Routes under /api/v1
  app.route('/api/v1/goals', goalsRouter(goalRepo, goalAgentAssignmentRepo, goalAgentHistoryService));
  app.route('/api/v1/attempts', attemptsRouter(goalRepo, attemptRepo, goalAgentHistoryService));
  app.route('/api/v1/reflections', reflectionsRouter(policyService, attemptRepo, goalAgentHistoryService));
  app.route('/api/v1/policies', policiesRouter(goalRepo, policyRepo));
  app.route('/api/v1/retry-guard', retryGuardRouter(goalRepo, policyRepo, attemptRepo, retryHistoryRepo, goalAgentHistoryService));
  app.route('/api/v1/recovery-packet', recoveryRouter(recoveryService, recoveryEventRepo, goalAgentHistoryService));
  app.route('/api/v1/health', healthRouter());
  app.route('/api/v1/ui', uiApiRouter(goalRepo, attemptRepo, reflectionRepo, policyRepo, retryHistoryRepo, recoveryEventRepo, goalAgentAssignmentRepo, goalAgentHistoryService, recoveryService, {
    projectionDir: options?.ui?.projectionDir,
    workspaceStatePath: options?.ui?.workspaceStatePath,
    runtimeStatePath: options?.ui?.runtimeStatePath,
  }));
  app.route('/ui', uiPageRouter());

  return app;
}
