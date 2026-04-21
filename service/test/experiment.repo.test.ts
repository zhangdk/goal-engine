import { describe, expect, it } from 'vitest';
import { makeTestDb, nowIso } from './helpers.js';
import { GoalRepo } from '../src/repos/goal.repo.js';
import { ExperimentRepo } from '../src/repos/experiment.repo.js';
import { AttemptRepo } from '../src/repos/attempt.repo.js';
import type { Experiment } from '../../shared/types.js';

function seedGoal(agentId: string, goalId: string) {
  const db = makeTestDb();
  const goalRepo = new GoalRepo(db);

  goalRepo.create({
    id: goalId,
    agentId,
    title: `${agentId} goal`,
    status: 'active',
    successCriteria: ['succeed'],
    stopConditions: [],
    priority: 1,
    currentStage: 'search',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });

  return { db };
}

describe('ExperimentRepo', () => {
  function createExperiment(overrides: Partial<Experiment> = {}): Experiment {
    const now = nowIso();
    return {
      id: 'exp_1',
      agentId: 'goal-engine-demo',
      goalId: 'goal_1',
      stage: 'channel-validation',
      hypothesis: 'Direct outreach will produce reply evidence faster than broad search',
      actionPlan: 'Prepare 5 targeted outreach drafts',
      expectedSignal: 'At least one concrete reply or permission boundary',
      costLevel: 'low',
      boundaryLevel: 'safe',
      whyDifferent: 'Switches from broad search to buyer-specific outreach',
      status: 'active',
      createdAt: now,
      updatedAt: now,
      ...overrides,
    };
  }

  it('creates and reads an active experiment for a goal', () => {
    const { db } = seedGoal('goal-engine-demo', 'goal_1');
    const repo = new ExperimentRepo(db);

    repo.create(createExperiment());

    expect(repo.getById('goal-engine-demo', 'exp_1')).toEqual(
      expect.objectContaining({
        id: 'exp_1',
        status: 'active',
        whyDifferent: expect.stringContaining('broad search'),
      })
    );
  });

  it('lists, finds active, and updates experiments within a goal scope', () => {
    const { db } = seedGoal('goal-engine-demo', 'goal_1');
    const repo = new ExperimentRepo(db);
    repo.create(createExperiment({ id: 'exp_archived', status: 'completed' }));
    repo.create(createExperiment({ id: 'exp_active', status: 'active' }));

    expect(repo.listByGoal('goal-engine-demo', 'goal_1').map((experiment) => experiment.id)).toEqual(
      expect.arrayContaining(['exp_archived', 'exp_active'])
    );
    expect(repo.getActiveByGoal('goal-engine-demo', 'goal_1')).toEqual(
      expect.objectContaining({ id: 'exp_active', status: 'active' })
    );

    const updated = repo.update('goal-engine-demo', 'exp_active', {
      stage: 'permission-check',
      actionPlan: 'Ask for approval before outreach',
      expectedSignal: 'User grants or denies approval',
      whyDifferent: 'Adds an explicit permission boundary',
      boundaryLevel: 'permission_required',
      costLevel: 'medium',
      status: 'blocked',
    });

    expect(updated).toEqual(
      expect.objectContaining({
        stage: 'permission-check',
        actionPlan: 'Ask for approval before outreach',
        expectedSignal: 'User grants or denies approval',
        whyDifferent: 'Adds an explicit permission boundary',
        boundaryLevel: 'permission_required',
        costLevel: 'medium',
        status: 'blocked',
      })
    );
    expect(repo.update('goal-engine-demo', 'missing', { status: 'abandoned' })).toBeNull();
  });

  it('persists experiment linkage on attempts and keeps legacy attempts readable', () => {
    const { db } = seedGoal('goal-engine-demo', 'goal_1');
    const experimentRepo = new ExperimentRepo(db);
    const attemptRepo = new AttemptRepo(db);
    const now = nowIso();
    experimentRepo.create(createExperiment());

    attemptRepo.create({
      id: 'attempt_with_experiment',
      agentId: 'goal-engine-demo',
      goalId: 'goal_1',
      experimentId: 'exp_1',
      stage: 'channel-validation',
      actionTaken: 'Sent draft for approval',
      strategyTags: ['direct-outreach'],
      result: 'partial',
      createdAt: now,
    });
    attemptRepo.create({
      id: 'attempt_legacy',
      agentId: 'goal-engine-demo',
      goalId: 'goal_1',
      stage: 'channel-validation',
      actionTaken: 'Checked the same site again',
      strategyTags: ['web'],
      result: 'failure',
      failureType: 'strategy_mismatch',
      createdAt: now,
    });

    expect(attemptRepo.getById('goal-engine-demo', 'attempt_with_experiment')).toEqual(
      expect.objectContaining({ experimentId: 'exp_1' })
    );
    expect(attemptRepo.getById('goal-engine-demo', 'attempt_legacy')?.experimentId).toBeUndefined();
  });

  it('rejects attempts linked to missing experiments in the same goal scope', () => {
    const { db } = seedGoal('goal-engine-demo', 'goal_1');
    const attemptRepo = new AttemptRepo(db);

    expect(() =>
      attemptRepo.create({
        id: 'attempt_orphan',
        agentId: 'goal-engine-demo',
        goalId: 'goal_1',
        experimentId: 'missing_exp',
        stage: 'channel-validation',
        actionTaken: 'Sent draft for approval',
        strategyTags: ['direct-outreach'],
        result: 'partial',
        createdAt: nowIso(),
      })
    ).toThrow();
  });
});
