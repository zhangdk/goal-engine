import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdapterClient } from '../src/client.js';
import { bootstrapSession } from '../src/openclaw/bootstrap-session.js';
import { dispatchEntrypoint } from '../src/openclaw/dispatch-entrypoint.js';

const BASE_URL = 'http://localhost:3100';
const tempDirs: string[] = [];
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const defaultProjectionDir = join(repoRoot, 'examples', 'workspace', 'goal-engine');
const projectionFilenames = ['current-goal.md', 'current-policy.md', 'recovery-packet.md'] as const;
const defaultProjectionBackups = new Map<string, string | undefined>();

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    rmSync(dir, { recursive: true, force: true });
  }
  restoreDefaultProjectionFiles();
});

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function overwriteDefaultProjectionFiles(files: Partial<Record<(typeof projectionFilenames)[number], string>>): void {
  for (const filename of projectionFilenames) {
    const path = join(defaultProjectionDir, filename);
    if (!defaultProjectionBackups.has(filename)) {
      defaultProjectionBackups.set(filename, existsSync(path) ? readFileSync(path, 'utf-8') : undefined);
    }
    writeFileSync(path, files[filename] ?? '', 'utf-8');
  }
}

function restoreDefaultProjectionFiles(): void {
  for (const [filename, content] of defaultProjectionBackups.entries()) {
    const path = join(defaultProjectionDir, filename);
    if (content === undefined) {
      rmSync(path, { force: true });
      continue;
    }
    writeFileSync(path, content, 'utf-8');
  }
  defaultProjectionBackups.clear();
}

describe('dispatchEntrypoint', () => {
  it('records evidence through the user-facing entrypoint', async () => {
    const fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({
        data: {
          id: 'evidence_1',
          goal_id: 'goal_1',
          kind: 'artifact',
          summary: 'Artifact created',
          file_path: 'artifact.md',
          observed_at: '2026-04-17T00:00:00.000Z',
          verifier: 'agent',
          confidence: 0.8,
          created_at: '2026-04-17T00:00:00.000Z',
        },
      }),
    });

    const client = new AdapterClient(BASE_URL, fetch as unknown as typeof globalThis.fetch);
    const result = await dispatchEntrypoint(client, {
      entrypoint: 'record evidence',
      input: {
        goalId: 'goal_1',
        kind: 'artifact',
        summary: 'Artifact created',
        filePath: 'artifact.md',
      },
    });

    expect(result.entrypoint).toBe('record evidence');
    expect(result.summary).toContain('Evidence recorded: evidence_1');
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/api/v1/evidence`);
    expect(JSON.parse(init.body as string).file_path).toBe('artifact.md');
  });

  it('completes a goal through the user-facing entrypoint', async () => {
    const fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          goal: {
            id: 'goal_1',
            title: 'Goal',
            status: 'completed',
            success_criteria: ['Evidence exists'],
            stop_conditions: [],
            priority: 1,
            current_stage: 'done',
            created_at: '2026-04-17T00:00:00.000Z',
            updated_at: '2026-04-17T00:00:00.000Z',
          },
          completion: {
            id: 'completion_1',
            goal_id: 'goal_1',
            evidence_ids: ['evidence_1'],
            summary: 'Done',
            completed_at: '2026-04-17T00:00:00.000Z',
          },
          evidence: [],
        },
      }),
    });

    const client = new AdapterClient(BASE_URL, fetch as unknown as typeof globalThis.fetch);
    const result = await dispatchEntrypoint(client, {
      entrypoint: 'complete goal',
      input: {
        goalId: 'goal_1',
        evidenceIds: ['evidence_1'],
        summary: 'Done',
      },
    });

    expect(result.entrypoint).toBe('complete goal');
    expect(result.summary).toContain('Goal completed: Goal');
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${BASE_URL}/api/v1/goals/goal_1/complete`);
    expect(JSON.parse(init.body as string).evidence_ids).toEqual(['evidence_1']);
  });

  it('returns a user-readable evidence error when no goal can be inferred', async () => {
    const fetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({
        error: { code: 'no_active_goal', message: 'No active goal' },
      }),
    });

    const client = new AdapterClient(BASE_URL, fetch as unknown as typeof globalThis.fetch);
    const result = await dispatchEntrypoint(client, {
      entrypoint: 'record evidence',
      input: {
        kind: 'artifact',
        summary: 'Artifact created',
      },
    });

    expect(result.summary).toContain('Run show goal status or pass goalId');
  });

  it('maps record failed attempt to the active goal and returns a user-facing summary', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            id: 'goal_1',
            title: 'Ship Goal Engine UX',
            status: 'active',
            success_criteria: ['One explicit flow works'],
            stop_conditions: [],
            priority: 1,
            current_stage: 'integration',
            created_at: '2026-04-04T10:00:00.000Z',
            updated_at: '2026-04-04T10:00:00.000Z',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          data: {
            id: 'attempt_1',
            goal_id: 'goal_1',
            stage: 'integration',
            action_taken: 'Repeated the same path',
            strategy_tags: ['repeat'],
            result: 'failure',
            failure_type: 'stuck_loop',
            created_at: '2026-04-04T10:00:00.000Z',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          data: {
            reflection: {
              id: 'reflection_1',
              goal_id: 'goal_1',
              attempt_id: 'attempt_1',
              summary: 'Repeated the same path',
              root_cause: '陷入重复循环，无进展',
              must_change: '强制切换路径，引入新输入材料',
              avoid_strategy: 'repeat',
              created_at: '2026-04-04T10:01:00.000Z',
            },
            policy: {
              id: 'policy_1',
              goal_id: 'goal_1',
              preferred_next_step: 'Try a smaller next step',
              avoid_strategies: ['repeat'],
              must_check_before_retry: ['Confirm the path is different'],
              updated_at: '2026-04-04T10:01:00.000Z',
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            goal_id: 'goal_1',
            goal_title: 'Ship Goal Engine UX',
            current_stage: 'integration',
            success_criteria: ['One explicit flow works'],
            last_failure_summary: 'Repeated the same path',
            avoid_strategies: ['repeat'],
            preferred_next_step: 'Try a smaller next step',
            generated_at: '2026-04-04T10:01:00.000Z',
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
            preferred_next_step: 'Try a smaller next step',
            avoid_strategies: ['repeat'],
            must_check_before_retry: ['Confirm the path is different'],
            updated_at: '2026-04-04T10:01:00.000Z',
          },
        }),
      });

    const client = new AdapterClient(BASE_URL, fetch as unknown as typeof globalThis.fetch);
    const projectionDir = createTempDir('goal-engine-openclaw-dispatch-');

    const result = await dispatchEntrypoint(client, {
      entrypoint: 'record failed attempt',
      input: {
        stage: 'integration',
        actionTaken: 'Repeated the same path',
        strategyTags: ['repeat'],
        failureType: 'stuck_loop',
        projectionDir,
      },
    });

    expect(result.entrypoint).toBe('record failed attempt');
    expect(result.summary).toContain('Failed attempt recorded.');
    expect(result.summary).toContain('Updated guidance:');
    expect(fetch).toHaveBeenCalledTimes(5);
  });

  it('normalizes tool_unavailable into the service-supported external_blocker failure type', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            id: 'goal_1',
            title: 'Ship Goal Engine UX',
            status: 'active',
            success_criteria: ['One explicit flow works'],
            stop_conditions: [],
            priority: 1,
            current_stage: 'integration',
            created_at: '2026-04-04T10:00:00.000Z',
            updated_at: '2026-04-04T10:00:00.000Z',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          data: {
            id: 'attempt_1',
            goal_id: 'goal_1',
            stage: 'integration',
            action_taken: 'Web search was blocked',
            strategy_tags: ['web'],
            result: 'failure',
            failure_type: 'external_blocker',
            created_at: '2026-04-04T10:00:00.000Z',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          data: {
            reflection: {
              id: 'reflection_1',
              goal_id: 'goal_1',
              attempt_id: 'attempt_1',
              summary: 'Web search was blocked',
              root_cause: '遇到外部阻碍，无法继续推进',
              must_change: '绕过阻碍或请求外部介入',
              avoid_strategy: 'web',
              created_at: '2026-04-04T10:01:00.000Z',
            },
            policy: {
              id: 'policy_1',
              goal_id: 'goal_1',
              preferred_next_step: 'Try a smaller next step',
              avoid_strategies: ['web'],
              must_check_before_retry: ['Confirm the path is different'],
              updated_at: '2026-04-04T10:01:00.000Z',
            },
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            goal_id: 'goal_1',
            goal_title: 'Ship Goal Engine UX',
            current_stage: 'integration',
            success_criteria: ['One explicit flow works'],
            last_failure_summary: 'Web search was blocked',
            avoid_strategies: ['web'],
            preferred_next_step: 'Try a smaller next step',
            generated_at: '2026-04-04T10:01:00.000Z',
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
            preferred_next_step: 'Try a smaller next step',
            avoid_strategies: ['web'],
            must_check_before_retry: ['Confirm the path is different'],
            updated_at: '2026-04-04T10:01:00.000Z',
          },
        }),
      });

    const client = new AdapterClient(BASE_URL, fetch as unknown as typeof globalThis.fetch);
    const projectionDir = createTempDir('goal-engine-openclaw-dispatch-alias-');

    const result = await dispatchEntrypoint(client, {
      entrypoint: 'record failed attempt',
      input: {
        stage: 'integration',
        actionTaken: 'Web search was blocked',
        strategyTags: ['web'],
        failureType: 'tool_unavailable' as any,
        projectionDir,
      },
    });

    expect(result.entrypoint).toBe('record failed attempt');
    expect(result.summary).toContain('Failed attempt recorded.');

    const attemptCall = fetch.mock.calls[1];
    expect(attemptCall?.[0]).toBe(`${BASE_URL}/api/v1/attempts`);
    const sentBody = JSON.parse(String(attemptCall?.[1] && (attemptCall[1] as RequestInit).body));
    expect(sentBody.failure_type).toBe('external_blocker');
  });

  it('supervises a rough revenue goal by compiling it into an executable goal contract', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          data: {
            id: 'goal_revenue_1',
            title: 'Revenue Sprint: earn 100 RMB within 24 hours',
            status: 'active',
            success_criteria: [
              'Confirmed revenue is at least 100 RMB before the deadline.',
              'Completion requires payment, order confirmation, or user-confirmed equivalent value.',
            ],
            stop_conditions: [
              'Stop before sending messages, posting publicly, using user identity, or handling payment without explicit authorization.',
            ],
            priority: 1,
            current_stage: 'goal-contract',
            created_at: '2026-04-13T07:18:32.373Z',
            updated_at: '2026-04-13T07:18:32.373Z',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            agent_id: 'main',
            goal_id: 'goal_revenue_1',
            goal_title: 'Revenue Sprint: earn 100 RMB within 24 hours',
            current_stage: 'goal-contract',
            success_criteria: [
              'Confirmed revenue is at least 100 RMB before the deadline.',
              'Completion requires payment, order confirmation, or user-confirmed equivalent value.',
            ],
            avoid_strategies: [],
            recent_attempts: [],
            relevant_knowledge: [],
            shared_wisdom: [],
            open_questions: [],
            generated_at: '2026-04-13T07:18:32.373Z',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'no_policy_yet', message: 'No policy yet' },
        }),
      });

    const client = new AdapterClient(BASE_URL, fetch as unknown as typeof globalThis.fetch);
    const projectionDir = createTempDir('goal-engine-supervise-external-');

    const result = await dispatchEntrypoint(client, {
      entrypoint: 'supervise external goal',
      input: {
        userMessage: '给你个任务，你要在一天内赚100元，方法不限。',
        receivedAt: '2026-04-13T07:18:32.373Z',
        replaceActiveGoal: true,
        projectionDir,
      },
    });

    expect(result.entrypoint).toBe('supervise external goal');
    expect(result.summary).toContain('External goal supervised.');
    expect(result.summary).toContain('Goal contract: Revenue Sprint: earn 100 RMB within 24 hours');
    expect(result.summary).toContain('Do not ask the user to choose the strategy.');
    expect(result.summary).toContain('Next required action: call show goal status');

    const createCall = fetch.mock.calls[0];
    expect(createCall?.[0]).toBe(`${BASE_URL}/api/v1/goals`);
    const sentBody = JSON.parse(String(createCall?.[1] && (createCall[1] as RequestInit).body));
    expect(sentBody.replace_active).toBe(true);
    expect(sentBody.current_stage).toBe('goal-contract');
    expect(sentBody.success_criteria).toEqual(expect.arrayContaining([
      'Confirmed revenue is at least 100 RMB before the deadline.',
      'Completion requires payment, order confirmation, or user-confirmed equivalent value.',
      'Each attempt must produce external evidence, a concrete sales asset, a channel result, or a recorded permission boundary.',
    ]));
    expect(sentBody.stop_conditions).toEqual(expect.arrayContaining([
      'Stop before sending messages, posting publicly, using user identity, or handling payment without explicit authorization.',
    ]));
  });

  it('resolves recover current goal through the active goal and rebuilds projection when missing', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            id: 'goal_1',
            title: 'Ship Goal Engine UX',
            status: 'active',
            success_criteria: ['One explicit flow works'],
            stop_conditions: [],
            priority: 1,
            current_stage: 'integration',
            created_at: '2026-04-04T10:00:00.000Z',
            updated_at: '2026-04-04T10:00:00.000Z',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            goal_id: 'goal_1',
            goal_title: 'Ship Goal Engine UX',
            current_stage: 'integration',
            success_criteria: ['One explicit flow works'],
            last_failure_summary: 'Repeated the same path',
            avoid_strategies: ['repeat'],
            preferred_next_step: 'Try a smaller next step',
            generated_at: '2026-04-04T10:01:00.000Z',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'no_policy_yet', message: 'No policy yet' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            goal_id: 'goal_1',
            goal_title: 'Ship Goal Engine UX',
            current_stage: 'integration',
            success_criteria: ['One explicit flow works'],
            last_failure_summary: 'Repeated the same path',
            avoid_strategies: ['repeat'],
            preferred_next_step: 'Try a smaller next step',
            generated_at: '2026-04-04T10:01:00.000Z',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'no_policy_yet', message: 'No policy yet' },
        }),
      });

    const client = new AdapterClient(BASE_URL, fetch as unknown as typeof globalThis.fetch);
    const projectionDir = createTempDir('goal-engine-openclaw-recover-');

    const result = await dispatchEntrypoint(client, {
      entrypoint: 'recover current goal',
      input: { projectionDir },
    });

    expect(result.summary).toContain('Recovery summary:');
    expect(result.summary).toContain('Projection: rebuilt from service');
    expect(readFileSync(join(projectionDir, 'current-goal.md'), 'utf-8')).toContain('Ship Goal Engine UX');
  });
});

describe('bootstrapSession', () => {
  it('uses local projection first when projection files are already available', async () => {
    const projectionDir = createTempDir('goal-engine-bootstrap-ready-');
    writeFileSync(join(projectionDir, 'current-goal.md'), '# Current Goal\n\n## 最近失败摘要\n\nProjection first summary\n', 'utf-8');
    writeFileSync(join(projectionDir, 'current-policy.md'), '# Current Policy\n\n## 推荐下一步\n\nProjection next step\n', 'utf-8');
    writeFileSync(join(projectionDir, 'recovery-packet.md'), '# Recovery Packet\n\n## 最近失败摘要\n\nProjection first summary\n', 'utf-8');

    const workspaceStatePath = join(createTempDir('goal-engine-workspace-state-'), 'workspace-state.json');
    writeFileSync(workspaceStatePath, JSON.stringify({
      version: 1,
      goalEngine: {
        projectionDir,
        bootstrapBehavior: {
          preferProjection: true,
          rebuildOnMissingProjection: true,
          emptyStateEntrypoint: 'start goal',
        },
      },
    }, null, 2), 'utf-8');

    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            id: 'goal_1',
            title: 'Projection Goal',
            status: 'active',
            success_criteria: ['One explicit flow works'],
            stop_conditions: [],
            priority: 1,
            current_stage: 'integration',
            created_at: '2026-04-04T10:00:00.000Z',
            updated_at: '2026-04-04T10:00:00.000Z',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'no_policy_yet', message: 'No policy yet' },
        }),
      });

    const client = new AdapterClient(BASE_URL, fetch as unknown as typeof globalThis.fetch);
    const result = await bootstrapSession(client, { workspaceStatePath });

    expect(result.action).toBe('show goal status');
    expect(result.summary).toContain('Session bootstrap used local projection first.');
    expect(result.summary).toContain('Projection Goal');
  });

  it('recovers from service when projection is missing and there is an active goal', async () => {
    const projectionDir = createTempDir('goal-engine-bootstrap-projection-');
    const workspaceStatePath = join(createTempDir('goal-engine-workspace-state-'), 'workspace-state.json');
    writeFileSync(workspaceStatePath, JSON.stringify({
      version: 1,
      goalEngine: {
        projectionDir,
        bootstrapBehavior: {
          preferProjection: true,
          rebuildOnMissingProjection: true,
          emptyStateEntrypoint: 'start goal',
        },
      },
    }, null, 2), 'utf-8');

    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            id: 'goal_1',
            title: 'Recover Goal',
            status: 'active',
            success_criteria: ['One explicit flow works'],
            stop_conditions: [],
            priority: 1,
            current_stage: 'integration',
            created_at: '2026-04-04T10:00:00.000Z',
            updated_at: '2026-04-04T10:00:00.000Z',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            goal_id: 'goal_1',
            goal_title: 'Recover Goal',
            current_stage: 'integration',
            success_criteria: ['One explicit flow works'],
            last_failure_summary: 'Projection was missing',
            avoid_strategies: ['repeat'],
            preferred_next_step: 'Recover from service',
            generated_at: '2026-04-04T10:01:00.000Z',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'no_policy_yet', message: 'No policy yet' },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            goal_id: 'goal_1',
            goal_title: 'Recover Goal',
            current_stage: 'integration',
            success_criteria: ['One explicit flow works'],
            last_failure_summary: 'Projection was missing',
            avoid_strategies: ['repeat'],
            preferred_next_step: 'Recover from service',
            generated_at: '2026-04-04T10:01:00.000Z',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({
          error: { code: 'no_policy_yet', message: 'No policy yet' },
        }),
      });

    const client = new AdapterClient(BASE_URL, fetch as unknown as typeof globalThis.fetch);
    const result = await bootstrapSession(client, { workspaceStatePath });

    expect(result.action).toBe('recover current goal');
    expect(result.summary).toContain('Session bootstrap rebuilt state from service.');
    expect(result.summary).toContain('Recover Goal');
    expect(readFileSync(join(projectionDir, 'current-goal.md'), 'utf-8')).toContain('Recover Goal');
  });

  it('suggests start goal when bootstrap finds no active goal', async () => {
    const projectionDir = createTempDir('goal-engine-bootstrap-empty-');
    const workspaceStatePath = join(createTempDir('goal-engine-workspace-state-'), 'workspace-state.json');
    writeFileSync(workspaceStatePath, JSON.stringify({
      version: 1,
      goalEngine: {
        projectionDir,
        bootstrapBehavior: {
          preferProjection: true,
          rebuildOnMissingProjection: true,
          emptyStateEntrypoint: 'start goal',
        },
      },
    }, null, 2), 'utf-8');

    const fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({
        error: { code: 'no_active_goal', message: 'No active goal exists' },
      }),
    });

    const client = new AdapterClient(BASE_URL, fetch as unknown as typeof globalThis.fetch);
    const result = await bootstrapSession(client, { workspaceStatePath });

    expect(result.action).toBe('start goal');
    expect(result.summary).toContain('Session bootstrap found no active goal.');
    expect(result.summary).toContain('Use start goal to create one.');
  });
});
