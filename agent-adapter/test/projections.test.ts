import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdapterClient, type AdapterError } from '../src/client.js';
import { refreshProjections } from '../src/projections/refresh-projections.js';
import { loadProjectionState } from '../src/projections/load-projection-state.js';

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

const tempDirs: string[] = [];

function createTempProjectionDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'goal-engine-projections-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  vi.restoreAllMocks();

  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('refreshProjections', () => {
  it('refreshes projection files from recovery packet and policy', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            goal_id: 'goal_1',
            goal_title: 'Ship Goal Engine',
            current_stage: 'integration',
            success_criteria: ['One OpenClaw user flow works'],
            avoid_strategies: ['repeat'],
            preferred_next_step: 'Integrate explicit Goal Engine entrypoint',
            generated_at: '2026-04-04T10:00:00.000Z',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            id: 'policy_1',
            goal_id: 'goal_1',
            preferred_next_step: 'Integrate explicit Goal Engine entrypoint',
            avoid_strategies: ['repeat'],
            must_check_before_retry: ['Confirm this attempt is different'],
            updated_at: '2026-04-04T10:00:00.000Z',
          },
        }),
      });

    const client = new AdapterClient('http://localhost:3100', fetch as unknown as typeof globalThis.fetch);
    const projectionDir = createTempProjectionDir();

    const result = await refreshProjections(client, {
      goalId: 'goal_1',
      projectionDir,
    });

    expect(result.goalId).toBe('goal_1');
    expect(result.policyLoaded).toBe(true);
    expect(readFileSync(join(projectionDir, 'current-goal.md'), 'utf-8')).toContain('Ship Goal Engine');
    expect(readFileSync(join(projectionDir, 'current-policy.md'), 'utf-8')).toContain('Integrate explicit Goal Engine entrypoint');
    expect(readFileSync(join(projectionDir, 'recovery-packet.md'), 'utf-8')).toContain('repeat');
  });

  it('still writes stable projection files when no policy exists yet', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            goal_id: 'goal_1',
            goal_title: 'First goal',
            current_stage: 'initial',
            success_criteria: ['State should be visible'],
            avoid_strategies: [],
            generated_at: '2026-04-04T10:00:00.000Z',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: {
            code: 'no_policy_yet',
            message: 'No policy yet',
          },
        }),
      });

    const client = new AdapterClient('http://localhost:3100', fetch as unknown as typeof globalThis.fetch);
    const projectionDir = createTempProjectionDir();

    const result = await refreshProjections(client, {
      goalId: 'goal_1',
      projectionDir,
    });

    expect(result.policyLoaded).toBe(false);
    expect(readFileSync(join(projectionDir, 'current-policy.md'), 'utf-8')).toContain('暂无策略');
  });

  it('returns a stable adapter error when refresh fails before files are written', async () => {
    const fetch = mockFetch(404, {
      error: {
        code: 'not_found',
        message: 'Goal not found',
      },
    });

    const client = new AdapterClient('http://localhost:3100', fetch as unknown as typeof globalThis.fetch);
    const projectionDir = createTempProjectionDir();

    await expect(refreshProjections(client, {
      goalId: 'missing_goal',
      projectionDir,
    })).rejects.toMatchObject({
      code: 'not_found',
      status: 404,
    } satisfies Partial<AdapterError>);
  });
});

describe('loadProjectionState', () => {
  it('loads the lightweight projection state from local files', async () => {
    const projectionDir = createTempProjectionDir();
    writeFileSync(join(projectionDir, 'current-goal.md'), '# Current Goal\n\nShip Goal Engine\n', 'utf-8');
    writeFileSync(join(projectionDir, 'current-policy.md'), '# Current Policy\n\n- `repeat`\n', 'utf-8');
    writeFileSync(join(projectionDir, 'recovery-packet.md'), '# Recovery Packet\n\n推荐下一步\n', 'utf-8');

    const state = await loadProjectionState({ projectionDir });

    expect(state.hasCurrentGoal).toBe(true);
    expect(state.hasCurrentPolicy).toBe(true);
    expect(state.hasRecoveryPacket).toBe(true);
    expect(state.currentGoalPreview).toContain('Ship Goal Engine');
  });

  it('returns a safe empty state when projection files do not exist', async () => {
    const projectionDir = createTempProjectionDir();

    const state = await loadProjectionState({ projectionDir });

    expect(state.hasCurrentGoal).toBe(false);
    expect(state.hasCurrentPolicy).toBe(false);
    expect(state.hasRecoveryPacket).toBe(false);
    expect(state.currentGoalPreview).toBeUndefined();
  });
});
