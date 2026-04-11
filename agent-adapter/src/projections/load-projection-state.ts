import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type LoadProjectionStateInput = {
  projectionDir: string;
};

export type ProjectionState = {
  hasCurrentGoal: boolean;
  hasCurrentPolicy: boolean;
  hasRecoveryPacket: boolean;
  currentGoalPreview?: string;
  currentPolicyPreview?: string;
  recoveryPacketPreview?: string;
};

export async function loadProjectionState(
  input: LoadProjectionStateInput
): Promise<ProjectionState> {
  const currentGoal = readOptional(join(input.projectionDir, 'current-goal.md'));
  const currentPolicy = readOptional(join(input.projectionDir, 'current-policy.md'));
  const recoveryPacket = readOptional(join(input.projectionDir, 'recovery-packet.md'));

  return {
    hasCurrentGoal: currentGoal !== undefined,
    hasCurrentPolicy: currentPolicy !== undefined,
    hasRecoveryPacket: recoveryPacket !== undefined,
    currentGoalPreview: currentGoal,
    currentPolicyPreview: currentPolicy,
    recoveryPacketPreview: recoveryPacket,
  };
}

function readOptional(path: string): string | undefined {
  if (!existsSync(path)) {
    return undefined;
  }

  return readFileSync(path, 'utf-8');
}
