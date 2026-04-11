import type { AdapterClient } from '../client.js';
import { goalCreate } from '../tools/goal-create.js';
import { goalGetCurrent } from '../tools/goal-get-current.js';
import { refreshProjections } from '../projections/refresh-projections.js';

export type StartGoalSessionInput = {
  title: string;
  successCriteria: string[];
  currentStage?: string;
  stopConditions?: string[];
  priority?: number;
  replaceActiveGoal?: boolean;
  projectionDir?: string;
};

export type StartGoalSessionResult = {
  goalId: string;
  summary: string;
};

export async function startGoalSession(
  client: AdapterClient,
  input: StartGoalSessionInput
): Promise<StartGoalSessionResult> {
  let goal;

  try {
    goal = await goalCreate(client, input);
  } catch (err: unknown) {
    if (!isStateConflictError(err)) {
      throw err;
    }

    const currentGoal = await goalGetCurrent(client);
    const requestedDiffers = currentGoal.title !== input.title;

    return {
      goalId: currentGoal.id,
      summary: [
        'Active goal conflict.',
        `Current active goal: ${currentGoal.title}`,
        `Current stage: ${currentGoal.currentStage}`,
        `Requested goal: ${input.title}`,
        requestedDiffers
          ? 'Requested goal differs from the active goal. Recover or finish the current goal before continuing.'
          : 'Requested goal matches the active goal title. Recover it instead of starting a duplicate goal.',
        'Use replaceActiveGoal to explicitly replace it when you are sure the old goal should be abandoned.',
      ].join('\n'),
    };
  }

  await refreshProjections(client, {
    goalId: goal.id,
    projectionDir: input.projectionDir,
  });

  return {
    goalId: goal.id,
    summary: `Goal started: ${goal.title}\nCurrent stage: ${goal.currentStage}\nSuccess criteria:\n${goal.successCriteria.map(item => `- ${item}`).join('\n')}`,
  };
}

function isStateConflictError(err: unknown): boolean {
  return typeof err === 'object'
    && err !== null
    && 'code' in err
    && err.code === 'state_conflict';
}
