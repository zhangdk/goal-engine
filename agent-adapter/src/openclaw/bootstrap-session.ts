import { readFileSync } from 'node:fs';
import type { AdapterClient } from '../client.js';
import { dispatchEntrypoint } from './dispatch-entrypoint.js';
import { DEFAULT_PROJECTION_DIR, DEFAULT_WORKSPACE_STATE_PATH } from './paths.js';
import { loadProjectionState } from '../projections/load-projection-state.js';

type WorkspaceState = {
  version: number;
  goalEngine?: {
    entrypoints?: string[];
    projectionDir?: string;
    bootstrapBehavior?: {
      preferProjection?: boolean;
      rebuildOnMissingProjection?: boolean;
      emptyStateEntrypoint?: string;
    };
  };
};

export type BootstrapSessionInput = {
  workspaceStatePath?: string;
};

export type BootstrapSessionResult = {
  summary: string;
  action: 'show goal status' | 'recover current goal' | 'start goal';
};

export async function bootstrapSession(
  client: AdapterClient,
  input: BootstrapSessionInput = {}
): Promise<BootstrapSessionResult> {
  const workspaceState = readWorkspaceState(input.workspaceStatePath ?? DEFAULT_WORKSPACE_STATE_PATH);
  const projectionDir = workspaceState.goalEngine?.projectionDir ?? DEFAULT_PROJECTION_DIR;
  const bootstrapBehavior = workspaceState.goalEngine?.bootstrapBehavior ?? {};
  const projectionState = await loadProjectionState({ projectionDir });
  const hasProjection = projectionState.hasCurrentGoal
    && projectionState.hasCurrentPolicy
    && projectionState.hasRecoveryPacket;

  if (bootstrapBehavior.preferProjection !== false && hasProjection) {
    const status = await dispatchEntrypoint(client, {
      entrypoint: 'show goal status',
      input: { projectionDir },
    });
    return {
      action: 'show goal status',
      summary: `Session bootstrap used local projection first.\n${status.summary}`,
    };
  }

  if (bootstrapBehavior.rebuildOnMissingProjection !== false) {
    const recovered = await dispatchEntrypoint(client, {
      entrypoint: 'recover current goal',
      input: { projectionDir },
    });

    if (recovered.summary.startsWith('No active goal right now.')) {
      return {
        action: 'start goal',
        summary: `Session bootstrap found no active goal.\nUse ${bootstrapBehavior.emptyStateEntrypoint ?? 'start goal'} to create one.`,
      };
    }

    return {
      action: 'recover current goal',
      summary: `Session bootstrap rebuilt state from service.\n${recovered.summary}`,
    };
  }

  return {
    action: 'start goal',
    summary: `Session bootstrap skipped automatic recovery.\nUse ${bootstrapBehavior.emptyStateEntrypoint ?? 'start goal'} if you want to begin a new goal.`,
  };
}

function readWorkspaceState(path: string): WorkspaceState {
  return JSON.parse(readFileSync(path, 'utf-8')) as WorkspaceState;
}
