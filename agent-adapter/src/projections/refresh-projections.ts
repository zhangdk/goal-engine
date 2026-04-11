import type { AdapterClient } from '../client.js';
import { policyGetCurrent } from '../tools/policy-get-current.js';
import { recoveryPacketGet } from '../tools/recovery-packet-get.js';
import * as projectionWriterModule from '../../../examples/workspace/goal-engine/projection-writer.js';
import type { ProjectionInput } from '../../../examples/workspace/goal-engine/projection-writer.js';

type ProjectionWriterModule = {
  writeProjections: (input: ProjectionInput) => void;
};

const projectionWriter = (
  'default' in projectionWriterModule
    ? projectionWriterModule.default
    : projectionWriterModule
) as ProjectionWriterModule;
const { writeProjections } = projectionWriter;

export type RefreshProjectionsInput = {
  goalId: string;
  projectionDir?: string;
};

export type RefreshProjectionsResult = {
  goalId: string;
  policyLoaded: boolean;
  projectionDir?: string;
};

export async function refreshProjections(
  client: AdapterClient,
  input: RefreshProjectionsInput
): Promise<RefreshProjectionsResult> {
  const recoveryPacket = await recoveryPacketGet(client, input.goalId);

  let policyLoaded = false;
  let policy = null;

  try {
    policy = await policyGetCurrent(client, input.goalId);
    policyLoaded = true;
  } catch (err: unknown) {
    if (!isNoPolicyYetError(err)) {
      throw err;
    }
  }

  writeProjections({
    recoveryPacket,
    policy,
    projectionDir: input.projectionDir,
  });

  return {
    goalId: recoveryPacket.goalId,
    policyLoaded,
    projectionDir: input.projectionDir,
  };
}

function isNoPolicyYetError(err: unknown): boolean {
  return typeof err === 'object'
    && err !== null
    && 'code' in err
    && err.code === 'no_policy_yet';
}
