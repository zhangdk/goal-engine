import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AdapterClient } from '../src/client.js';
import { startGoalSession } from '../src/workflows/start-goal-session.js';
import { showGoalStatus } from '../src/workflows/show-goal-status.js';
import { recordFailureAndRefresh } from '../src/workflows/record-failure-and-refresh.js';
import { recoverGoalSession } from '../src/workflows/recover-goal-session.js';
import { checkRetryAndExplain } from '../src/workflows/check-retry-and-explain.js';

const BASE_URL = 'http://localhost:3100';
const tempDirs: string[] = [];
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const defaultProjectionDir = join(repoRoot, 'examples', 'workspace', 'goal-engine');
const projectionFilenames = ['current-goal.md', 'current-policy.md', 'recovery-packet.md'] as const;
const defaultProjectionBackups = new Map<string, string | undefined>();

function createTempProjectionDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'goal-engine-workflows-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    rmSync(dir, { recursive: true, force: true });
  }
  restoreDefaultProjectionFiles();
});

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

describe('startGoalSession', () => {
  it('creates a goal, refreshes projections, and returns a compact summary', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          data: {
            id: 'goal_1',
            title: 'Ship Goal Engine UX',
            status: 'active',
            success_criteria: ['One OpenClaw user flow works'],
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
            success_criteria: ['One OpenClaw user flow works'],
            avoid_strategies: [],
            preferred_next_step: 'Wire OpenClaw entrypoint',
            generated_at: '2026-04-04T10:00:00.000Z',
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
    const projectionDir = createTempProjectionDir();
    const result = await startGoalSession(client, {
      title: 'Ship Goal Engine UX',
      successCriteria: ['One OpenClaw user flow works'],
      currentStage: 'integration',
      projectionDir,
    });

    expect(result.goalId).toBe('goal_1');
    expect(result.summary).toContain('Ship Goal Engine UX');
    expect(result.summary).toContain('integration');
    expect(readFileSync(join(projectionDir, 'current-goal.md'), 'utf-8')).toContain('Ship Goal Engine UX');
  });

  it('surfaces the current active goal when a new goal conflicts with it', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          error: {
            code: 'state_conflict',
            message: 'An active goal already exists',
          },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            id: 'goal_existing',
            title: 'Old Goal',
            status: 'active',
            success_criteria: ['Keep the old goal alive'],
            stop_conditions: [],
            priority: 1,
            current_stage: 'candidate-validation',
            created_at: '2026-04-04T10:00:00.000Z',
            updated_at: '2026-04-04T10:00:00.000Z',
          },
        }),
      });

    const client = new AdapterClient(BASE_URL, fetch as unknown as typeof globalThis.fetch);

    const result = await startGoalSession(client, {
      title: 'New Goal',
      successCriteria: ['Capture a phone number'],
      currentStage: 'search',
    });

    expect(result.goalId).toBe('goal_existing');
    expect(result.summary).toContain('Active goal conflict');
    expect(result.summary).toContain('Current active goal: Old Goal');
    expect(result.summary).toContain('Requested goal: New Goal');
    expect(result.summary).toContain('Use replaceActiveGoal to explicitly replace it');
  });
});

describe('showGoalStatus', () => {
  it('summarizes the active goal from service state and the existing projection files', async () => {
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
            success_criteria: ['One OpenClaw user flow works'],
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
            id: 'policy_1',
            goal_id: 'goal_1',
            preferred_next_step: 'Review current guidance',
            avoid_strategies: ['repeat'],
            must_check_before_retry: ['Confirm the next step is different'],
            updated_at: '2026-04-04T10:01:00.000Z',
          },
        }),
      });

    const client = new AdapterClient(BASE_URL, fetch as unknown as typeof globalThis.fetch);
    const projectionDir = createTempProjectionDir();
    writeFileSync(join(projectionDir, 'current-goal.md'), [
      '# Current Goal',
      '',
      '## 目标',
      '',
      'Ship Goal Engine UX',
      '',
      '## 当前阶段',
      '',
      'integration',
      '',
      '## 最近失败摘要',
      '',
      'Repeated the same path',
    ].join('\n'), 'utf-8');
    writeFileSync(join(projectionDir, 'current-policy.md'), [
      '# Current Policy',
      '',
      '## 推荐下一步',
      '',
      'Review current guidance',
      '',
      '## 禁止重复的策略',
      '',
      '- `repeat`',
    ].join('\n'), 'utf-8');
    writeFileSync(join(projectionDir, 'recovery-packet.md'), [
      '# Recovery Packet',
      '',
      '## 最近失败摘要',
      '',
      'Repeated the same path',
      '',
      '## 推荐下一步',
      '',
      'Review current guidance',
    ].join('\n'), 'utf-8');

    const result = await showGoalStatus(client, { projectionDir });

    expect(result.summary).toContain('Ship Goal Engine UX');
    expect(result.summary).toContain('integration');
    expect(result.summary).toContain('Recent failure: Repeated the same path');
    expect(result.summary).toContain('Current guidance: Next step: Review current guidance');
    expect(result.summary).toContain('Local projection: ready');
  });

  it('surfaces missing projections and points the user to recovery instead of rebuilding during status', async () => {
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
            success_criteria: ['One OpenClaw user flow works'],
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
          error: {
            code: 'no_policy_yet',
            message: 'No policy yet',
          },
        }),
      });

    const client = new AdapterClient(BASE_URL, fetch as unknown as typeof globalThis.fetch);
    const projectionDir = createTempProjectionDir();

    const result = await showGoalStatus(client, { projectionDir });

    expect(result.summary).toContain('Ship Goal Engine UX');
    expect(result.summary).toContain('Current guidance: not available yet.');
    expect(result.summary).toContain('Local projection: missing current goal, current guidance, recovery summary.');
    expect(result.summary).toContain('Run recover current goal to rebuild the local summary files.');
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('shows relevant knowledge in goal status output', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            id: 'goal_1',
            title: 'Find event',
            status: 'active',
            success_criteria: ['Find one event'],
            stop_conditions: [],
            priority: 1,
            current_stage: 'search',
            created_at: '2026-04-11T00:00:00.000Z',
            updated_at: '2026-04-11T00:00:00.000Z',
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
            goal_title: 'Find event',
            current_stage: 'search',
            success_criteria: ['Find one event'],
            avoid_strategies: [],
            relevant_knowledge: [
              {
                id: 'know_1',
                goal_id: 'goal_1',
                context: 'search stage',
                observation: 'Aggregator was stale.',
                hypothesis: 'Third-party index lag.',
                implication: 'Check official pages.',
                related_strategy_tags: ['event_search'],
                created_at: '2026-04-11T00:00:00.000Z',
              },
            ],
            shared_wisdom: [],
            recent_attempts: [],
            open_questions: [],
            generated_at: '2026-04-11T00:00:00.000Z',
          },
        }),
      });

    const client = new AdapterClient(BASE_URL, fetch as unknown as typeof globalThis.fetch);
    const result = await showGoalStatus(client, { projectionDir: createTempProjectionDir() });

    expect(result.summary).toContain('## 历史认知');
    expect(result.summary).toContain('Check official pages.');
  });

  it('returns an empty-state summary when there is no active goal', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({
        error: { code: 'no_active_goal', message: 'No active goal exists' },
      }),
    });

    const client = new AdapterClient(BASE_URL, fetch as unknown as typeof globalThis.fetch);
    const result = await showGoalStatus(client, { projectionDir: createTempProjectionDir() });

    expect(result.summary).toContain('No active goal right now.');
    expect(result.summary).toContain('Use start goal to create one');
  });

  it('uses the repo default projection directory when no projectionDir override is provided', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            id: 'goal_1',
            title: 'Repo Default Goal',
            status: 'active',
            success_criteria: ['One OpenClaw user flow works'],
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

    overwriteDefaultProjectionFiles({
      'current-goal.md': '# Current Goal\n\n## 最近失败摘要\n\nFallback from default projection\n',
      'current-policy.md': '# Current Policy\n\n（暂无策略）\n',
      'recovery-packet.md': '# Recovery Packet\n\n## 推荐下一步\n\nUse the default path\n',
    });

    const client = new AdapterClient(BASE_URL, fetch as unknown as typeof globalThis.fetch);
    const result = await showGoalStatus(client);

    expect(result.summary).toContain('Repo Default Goal');
    expect(result.summary).toContain('Recent failure: Fallback from default projection');
    expect(result.summary).toContain('Local projection: ready');
  });

  it('falls back to current-goal preview when recovery summary lacks the failure section', async () => {
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
            success_criteria: ['One OpenClaw user flow works'],
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
    const projectionDir = createTempProjectionDir();
    writeFileSync(join(projectionDir, 'current-goal.md'), '# Current Goal\n\n## 最近失败摘要\n\nUse the smaller next step\n', 'utf-8');
    writeFileSync(join(projectionDir, 'current-policy.md'), '# Current Policy\n\n（暂无策略）\n', 'utf-8');
    writeFileSync(join(projectionDir, 'recovery-packet.md'), '# Recovery Packet\n\n## 推荐下一步\n\nKeep going\n', 'utf-8');

    const result = await showGoalStatus(client, { projectionDir });

    expect(result.summary).toContain('Recent failure: Use the smaller next step');
  });

  it('parses CRLF projection files when extracting the recent failure summary', async () => {
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
            success_criteria: ['One OpenClaw user flow works'],
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
    const projectionDir = createTempProjectionDir();
    writeFileSync(join(projectionDir, 'current-goal.md'), '# Current Goal\r\n\r\n## 最近失败摘要\r\n\r\nCRLF failure summary\r\n', 'utf-8');
    writeFileSync(join(projectionDir, 'current-policy.md'), '# Current Policy\r\n\r\n（暂无策略）\r\n', 'utf-8');
    writeFileSync(join(projectionDir, 'recovery-packet.md'), '# Recovery Packet\r\n\r\n## 推荐下一步\r\n\r\nKeep going\r\n', 'utf-8');

    const result = await showGoalStatus(client, { projectionDir });

    expect(result.summary).toContain('Recent failure: CRLF failure summary');
  });

  it('blocks alignment when the expected new task does not match the current active goal and writes the snapshot to runtime-state', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-09T05:43:00.000Z'));

    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            id: 'goal_1',
            title: '帮我在上海浦东张江找到一个150-250平米、月租2-4万的办公室',
            status: 'active',
            success_criteria: ['拿到可联系号码'],
            stop_conditions: [],
            priority: 1,
            current_stage: 'goal-clarification',
            created_at: '2026-04-09T05:10:13.023Z',
            updated_at: '2026-04-09T05:10:13.023Z',
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
    const projectionDir = createTempProjectionDir();
    const runtimeStatePath = join(createTempProjectionDir(), 'runtime-state.json');

    writeFileSync(
      runtimeStatePath,
      JSON.stringify({
        goalEngine: {
          currentManagedAgentId: 'goal-engine-demo',
          managedAgents: [
            {
              agentId: 'goal-engine-demo',
              agentName: 'goal-engine-demo',
              workspace: 'goal-engine',
              session: 'main',
              managed: true,
            },
          ],
        },
      }),
      'utf-8'
    );

    const result = await showGoalStatus(client, {
      projectionDir,
      expectedGoalTitle: '帮我在上海浦东张江找一个适合15-25人培训或路演的会议场地',
      runtimeStatePath,
      runtimeContext: {
        agentId: 'goal-engine-demo',
        agentName: 'goal-engine-demo',
        workspace: 'goal-engine',
        session: 'main',
      },
    });

    expect(result.summary).toContain('Goal alignment: blocked.');
    expect(result.summary).toContain('Execution permission: denied until the active goal is aligned.');
    expect(result.summary).toContain('Current active goal: 帮我在上海浦东张江找到一个150-250平米、月租2-4万的办公室');
    expect(result.summary).toContain('Expected task goal: 帮我在上海浦东张江找一个适合15-25人培训或路演的会议场地');
    expect(result.summary).toContain('Do not continue search, browsing, or external tool execution yet.');
    expect(result.summary).toContain('Only allowed next actions: goal_engine_start_goal, goal_engine_recover_current_goal, or explicitly replacing the active goal.');
    expect(result.summary).toContain('Use goal_engine_start_goal, replaceActiveGoal, or goal_engine_recover_current_goal before any search or browsing.');

    expect(JSON.parse(readFileSync(runtimeStatePath, 'utf-8'))).toEqual({
      goalEngine: {
        currentManagedAgentId: 'goal-engine-demo',
        managedAgents: [
          {
            agentId: 'goal-engine-demo',
            agentName: 'goal-engine-demo',
            workspace: 'goal-engine',
            session: 'main',
            managed: true,
          },
        ],
        goalAlignmentSnapshots: {
          'goal-engine-demo': {
            status: 'blocked',
            expectedGoalTitle: '帮我在上海浦东张江找一个适合15-25人培训或路演的会议场地',
            activeGoalTitle: '帮我在上海浦东张江找到一个150-250平米、月租2-4万的办公室',
            projectionGoalTitle: null,
            nextAction: 'Use goal_engine_start_goal, replaceActiveGoal, or goal_engine_recover_current_goal before any search or browsing.',
            checkedAt: '2026-04-09T05:43:00.000Z',
          },
        },
        externalToolGuards: {
          'goal-engine-demo': {
            status: 'blocked',
            reason: 'Goal alignment is blocked.',
            nextAction: 'Use goal_engine_start_goal, replaceActiveGoal, or goal_engine_recover_current_goal before any search or browsing.',
            updatedAt: '2026-04-09T05:43:00.000Z',
          },
        },
        runtimeEvents: {},
      },
    });

    vi.useRealTimers();
  });
});

describe('recordFailureAndRefresh', () => {
  it('writes attempt and reflection, refreshes projections, and returns updated guidance', async () => {
    const fetch = vi
      .fn()
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
              preferred_next_step: '强制切换路径，引入新输入材料',
              avoid_strategies: ['repeat'],
              must_check_before_retry: ['确认当前路径与上次失败路径不同'],
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
            success_criteria: ['One OpenClaw user flow works'],
            last_failure_summary: 'Repeated the same path',
            avoid_strategies: ['repeat'],
            preferred_next_step: '强制切换路径，引入新输入材料',
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
            preferred_next_step: '强制切换路径，引入新输入材料',
            avoid_strategies: ['repeat'],
            must_check_before_retry: ['确认当前路径与上次失败路径不同'],
            updated_at: '2026-04-04T10:01:00.000Z',
          },
        }),
      });

    const client = new AdapterClient(BASE_URL, fetch as unknown as typeof globalThis.fetch);
    const projectionDir = createTempProjectionDir();
    const result = await recordFailureAndRefresh(client, {
      goalId: 'goal_1',
      stage: 'integration',
      actionTaken: 'Repeated the same path',
      strategyTags: ['repeat'],
      failureType: 'stuck_loop',
      projectionDir,
    });

    expect(result.attemptId).toBe('attempt_1');
    expect(result.guidanceSummary).toContain('强制切换路径');
    expect(result.guidanceSummary).toContain('repeat');
    expect(readFileSync(join(projectionDir, 'current-policy.md'), 'utf-8')).toContain('repeat');
  });
});

describe('recoverGoalSession', () => {
  it('formats recovery packet and policy into a restart-safe summary', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            goal_id: 'goal_1',
            goal_title: 'Ship Goal Engine UX',
            current_stage: 'integration',
            success_criteria: ['One OpenClaw user flow works'],
            last_failure_summary: 'Repeated the same path',
            avoid_strategies: ['repeat'],
            preferred_next_step: 'Try a different path',
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
            preferred_next_step: 'Try a different path',
            avoid_strategies: ['repeat'],
            must_check_before_retry: ['Confirm this path is new'],
            updated_at: '2026-04-04T10:01:00.000Z',
          },
        }),
      });

    const client = new AdapterClient(BASE_URL, fetch as unknown as typeof globalThis.fetch);
    const result = await recoverGoalSession(client, { goalId: 'goal_1' });

    expect(result.summary).toContain('Ship Goal Engine UX');
    expect(result.summary).toContain('Repeated the same path');
    expect(result.summary).toContain('Try a different path');
  });

  it('includes relevant knowledge in recovery summary', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            goal_id: 'goal_1',
            goal_title: 'Find event',
            current_stage: 'search',
            success_criteria: ['Find one event'],
            last_failure_summary: 'Aggregator failed',
            avoid_strategies: [],
            preferred_next_step: 'Check official pages',
            relevant_knowledge: [
              {
                id: 'know_1',
                goal_id: 'goal_1',
                context: 'search',
                observation: 'Aggregator was stale.',
                hypothesis: 'Index lag.',
                implication: 'Check official pages.',
                related_strategy_tags: ['event_search'],
                created_at: '2026-04-11T00:00:00.000Z',
              },
            ],
            shared_wisdom: [],
            recent_attempts: [],
            open_questions: [],
            generated_at: '2026-04-11T00:00:00.000Z',
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
    const result = await recoverGoalSession(client, { goalId: 'goal_1' });

    expect(result.summary).toContain('## 历史认知');
    expect(result.summary).toContain('Check official pages.');
  });

  it('labels recovery source as projection when local projection files are already available', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: {
            goal_id: 'goal_1',
            goal_title: 'Ship Goal Engine UX',
            current_stage: 'integration',
            success_criteria: ['One OpenClaw user flow works'],
            last_failure_summary: 'Repeated the same path',
            avoid_strategies: ['repeat'],
            preferred_next_step: 'Try a different path',
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
            preferred_next_step: 'Try a different path',
            avoid_strategies: ['repeat'],
            must_check_before_retry: ['Confirm this path is new'],
            updated_at: '2026-04-04T10:01:00.000Z',
          },
        }),
      });

    const client = new AdapterClient(BASE_URL, fetch as unknown as typeof globalThis.fetch);
    const projectionDir = createTempProjectionDir();
    writeFileSync(join(projectionDir, 'current-goal.md'), '# Current Goal\n\nShip Goal Engine UX\n', 'utf-8');
    writeFileSync(join(projectionDir, 'current-policy.md'), '# Current Policy\n\nTry a different path\n', 'utf-8');
    writeFileSync(join(projectionDir, 'recovery-packet.md'), '# Recovery Packet\n\nRepeated the same path\n', 'utf-8');

    const result = await recoverGoalSession(client, { goalId: 'goal_1', projectionDir });

    expect(result.summary).toContain('Projection: already available');
    expect(String(fetch.mock.calls[0]?.[0])).toContain('source=projection');
  });
});

describe('checkRetryAndExplain', () => {
  it('translates a blocked retry check into a user-facing explanation', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          allowed: false,
          reason: 'policy_not_acknowledged',
          warnings: [],
        },
      }),
    });

    const client = new AdapterClient(BASE_URL, fetch as unknown as typeof globalThis.fetch);
    const result = await checkRetryAndExplain(client, {
      goalId: 'goal_1',
      plannedAction: 'Repeat the same path',
      whatChanged: '',
      strategyTags: ['repeat'],
      policyAcknowledged: false,
    });

    expect(result.allowed).toBe(false);
    expect(result.rawReason).toBe('policy_not_acknowledged');
    expect(result.explanation).toContain('先确认你已经阅读并接受当前策略建议');
  });
});
