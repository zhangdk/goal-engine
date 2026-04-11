import type { AdapterClient } from '../client.js';
import { loadProjectionState } from '../projections/load-projection-state.js';
import { refreshProjections } from '../projections/refresh-projections.js';
import { DEFAULT_PROJECTION_DIR } from '../openclaw/paths.js';
import { policyGetCurrent } from '../tools/policy-get-current.js';
import { recoveryPacketGet } from '../tools/recovery-packet-get.js';

export type RecoverGoalSessionInput = {
  goalId: string;
  projectionDir?: string;
};

export type RecoverGoalSessionResult = {
  summary: string;
};

export async function recoverGoalSession(
  client: AdapterClient,
  input: RecoverGoalSessionInput
): Promise<RecoverGoalSessionResult> {
  const projectionDir = input.projectionDir ?? DEFAULT_PROJECTION_DIR;
  const projectionState = await loadProjectionState({ projectionDir });
  const projectionMissing = !projectionState.hasCurrentGoal
    || !projectionState.hasCurrentPolicy
    || !projectionState.hasRecoveryPacket;

  if (projectionMissing) {
    await refreshProjections(client, {
      goalId: input.goalId,
      projectionDir,
    });
  }

  const packet = await recoveryPacketGet(client, input.goalId, {
    source: projectionMissing ? 'service' : 'projection',
  });
  let policySummary = 'Current guidance not available yet.';

  try {
    const policy = await policyGetCurrent(client, input.goalId);
    policySummary = `Current guidance:\nNext step: ${policy.preferredNextStep ?? 'None'}\nAvoid:\n${policy.avoidStrategies.map(item => `- ${item}`).join('\n') || 'None'}`;
  } catch (err: unknown) {
    if (!isNoPolicyYetError(err)) {
      throw err;
    }
  }

  return {
    summary: `Recovery summary:\nGoal: ${packet.goalTitle}\nStage: ${packet.currentStage}\nLast failure: ${packet.lastFailureSummary ?? 'None'}\nRecommended next step: ${packet.preferredNextStep ?? 'None'}\nProjection: ${projectionMissing ? 'rebuilt from service' : 'already available'}\n${policySummary}`,
  };
}

function isNoPolicyYetError(err: unknown): boolean {
  return typeof err === 'object'
    && err !== null
    && 'code' in err
    && err.code === 'no_policy_yet';
}
