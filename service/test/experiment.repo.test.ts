import { describe, expect, it } from 'vitest';
import { makeTestDb, nowIso } from './helpers.js';
import { GoalRepo } from '../src/repos/goal.repo.js';
import { ExperimentRepo } from '../src/repos/experiment.repo.js';

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
  it('creates and reads an active experiment for a goal', () => {
    const { db } = seedGoal('goal-engine-demo', 'goal_1');
    const repo = new ExperimentRepo(db);
    const now = nowIso();

    repo.create({
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
    });

    expect(repo.getById('goal-engine-demo', 'exp_1')).toEqual(
      expect.objectContaining({
        id: 'exp_1',
        status: 'active',
        whyDifferent: expect.stringContaining('broad search'),
      })
    );
  });
});
