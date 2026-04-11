import type { AdapterClient } from '../client.js';
import type { FailureType } from '../../../shared/types.js';
import { attemptAppend } from '../tools/attempt-append.js';
import { reflectionCreate } from '../tools/reflection-create.js';
import { reflectionGenerate } from '../tools/reflection-generate.js';
import { refreshProjections } from '../projections/refresh-projections.js';

export type RecordFailureAndRefreshInput = {
  goalId: string;
  stage: string;
  actionTaken: string;
  strategyTags: string[];
  failureType: FailureType;
  confidence?: number;
  nextHypothesis?: string;
  projectionDir?: string;
};

export type RecordFailureAndRefreshResult = {
  attemptId: string;
  guidanceSummary: string;
};

export async function recordFailureAndRefresh(
  client: AdapterClient,
  input: RecordFailureAndRefreshInput
): Promise<RecordFailureAndRefreshResult> {
  const attempt = await attemptAppend(client, {
    goalId: input.goalId,
    stage: input.stage,
    actionTaken: input.actionTaken,
    strategyTags: input.strategyTags,
    result: 'failure',
    failureType: input.failureType,
    confidence: input.confidence,
    nextHypothesis: input.nextHypothesis,
  });

  const draft = reflectionGenerate({
    attemptSummary: input.actionTaken,
    failureType: input.failureType,
    strategyTags: input.strategyTags,
  });

  const reflectionResult = await reflectionCreate(client, {
    goalId: input.goalId,
    attemptId: attempt.id,
    summary: draft.summary,
    rootCause: draft.rootCause,
    mustChange: draft.mustChange,
    avoidStrategy: draft.avoidStrategy,
  });

  await refreshProjections(client, {
    goalId: input.goalId,
    projectionDir: input.projectionDir,
  });

  return {
    attemptId: attempt.id,
    guidanceSummary: `Updated guidance:\nNext step: ${reflectionResult.policy.preferredNextStep ?? 'None'}\nAvoid:\n${reflectionResult.policy.avoidStrategies.map(item => `- ${item}`).join('\n') || 'None'}`,
  };
}
