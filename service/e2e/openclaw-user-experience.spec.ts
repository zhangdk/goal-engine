import { expect, test } from '@playwright/test';
import { execFile } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

type GoalCreateResponse = {
  data: {
    id: string;
    title: string;
    current_stage: string;
  };
};

type AttemptCreateResponse = {
  data: {
    id: string;
  };
};

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const runtimeStatePath = resolve(repoRoot, '.openclaw', 'runtime-state.json');
const agentAdapterDir = resolve(repoRoot, 'agent-adapter');

test.describe('OpenClaw-oriented Goal Engine user experience', () => {
  test('supports explicit user flow from goal start to recovery summary', async ({ request }) => {
    const goalTitle = `OpenClaw UX Goal ${Date.now()}`;

    const existingGoalRes = await request.get('/api/v1/goals/current');
    if (existingGoalRes.status() === 200) {
      const existingGoalBody = await existingGoalRes.json() as {
        data: { id: string };
      };
      const closeGoalRes = await request.patch(`/api/v1/goals/${existingGoalBody.data.id}`, {
        data: { status: 'completed' },
      });
      expect(closeGoalRes.status()).toBe(200);
    }

    const startGoalRes = await request.post('/api/v1/goals', {
      data: {
        title: goalTitle,
        success_criteria: ['One explicit OpenClaw flow works'],
        stop_conditions: [],
        current_stage: 'integration',
      },
    });
    expect(startGoalRes.status()).toBe(201);
    const startGoalBody = await startGoalRes.json() as GoalCreateResponse;
    expect(startGoalBody.data.title).toBe(goalTitle);

    const showStatusRes = await request.get('/api/v1/goals/current');
    expect(showStatusRes.status()).toBe(200);
    const showStatusBody = await showStatusRes.json() as {
      data: {
        id: string;
        title: string;
        current_stage: string;
      };
    };
    expect(showStatusBody.data.id).toBe(startGoalBody.data.id);
    expect(showStatusBody.data.current_stage).toBe('integration');

    const failedAttemptRes = await request.post('/api/v1/attempts', {
      data: {
        goal_id: startGoalBody.data.id,
        stage: 'integration',
        action_taken: 'Repeated the same path without new input',
        strategy_tags: ['repeat'],
        result: 'failure',
        failure_type: 'stuck_loop',
      },
    });
    expect(failedAttemptRes.status()).toBe(201);
    const failedAttemptBody = await failedAttemptRes.json() as AttemptCreateResponse;

    const reflectionRes = await request.post('/api/v1/reflections', {
      data: {
        goal_id: startGoalBody.data.id,
        attempt_id: failedAttemptBody.data.id,
        summary: 'Repeated the same path without new input',
        root_cause: '没有先检查上次失败原因',
        must_change: '下一次执行前必须说明这次具体改了什么',
        avoid_strategy: 'repeat',
      },
    });
    expect(reflectionRes.status()).toBe(201);
    const reflectionBody = await reflectionRes.json() as {
      data: {
        policy: {
          avoid_strategies: string[];
          preferred_next_step?: string;
        };
      };
    };
    expect(reflectionBody.data.policy.avoid_strategies).toContain('repeat');
    expect(reflectionBody.data.policy.preferred_next_step).toBeTruthy();

    const retryCheckRes = await request.post('/api/v1/retry-guard/check', {
      data: {
        goal_id: startGoalBody.data.id,
        planned_action: 'Repeat the same path again',
        what_changed: '',
        strategy_tags: ['repeat'],
        policy_acknowledged: true,
      },
    });
    expect(retryCheckRes.status()).toBe(200);
    const retryCheckBody = await retryCheckRes.json() as {
      data: {
        allowed: boolean;
        reason: string;
      };
    };
    expect(retryCheckBody.data.allowed).toBe(false);
    expect(retryCheckBody.data.reason).toBe('blocked_strategy_overlap');

    const recoverRes = await request.get(`/api/v1/recovery-packet?goal_id=${startGoalBody.data.id}`);
    expect(recoverRes.status()).toBe(200);
    const recoverBody = await recoverRes.json() as {
      data: {
        goal_id: string;
        goal_title: string;
        current_stage: string;
        last_failure_summary?: string;
        avoid_strategies: string[];
        preferred_next_step?: string;
      };
    };
    expect(recoverBody.data.goal_id).toBe(startGoalBody.data.id);
    expect(recoverBody.data.goal_title).toBe(goalTitle);
    expect(recoverBody.data.current_stage).toBe('integration');
    expect(recoverBody.data.last_failure_summary).toContain('Repeated the same path');
    expect(recoverBody.data.avoid_strategies).toContain('repeat');
    expect(recoverBody.data.preferred_next_step).toBeTruthy();
  });

  test('accepts runtime context from the OpenClaw CLI and reflects the selected managed agent in /ui', async ({ request, baseURL }) => {
    const previousRuntimeState = safeRead(runtimeStatePath);

    try {
      const existingGoalRes = await request.get('/api/v1/goals/current');
      if (existingGoalRes.status() === 200) {
        const existingGoalBody = await existingGoalRes.json() as {
          data: { id: string };
        };
        const closeGoalRes = await request.patch(`/api/v1/goals/${existingGoalBody.data.id}`, {
          data: { status: 'completed' },
        });
        expect(closeGoalRes.status()).toBe(200);
      }

      await execFileAsync('pnpm', [
        'openclaw',
        'bootstrap',
        '--service-url',
        String(baseURL),
      ], {
        cwd: agentAdapterDir,
        env: {
          ...process.env,
          OPENCLAW_AGENT_ID: 'goal-engine-research',
          OPENCLAW_AGENT_NAME: 'goal-engine-research',
          OPENCLAW_WORKSPACE: 'goal-engine',
          OPENCLAW_SESSION: 'research',
        },
      });

      const goalTitle = `Runtime-selected managed agent ${Date.now()}`;
      const goalRes = await request.post('/api/v1/goals', {
        data: {
          title: goalTitle,
          success_criteria: ['Attach active goal to runtime-selected agent'],
          stop_conditions: [],
          current_stage: 'integration',
        },
      });
      expect(goalRes.status()).toBe(201);

      const uiRes = await request.get('/api/v1/ui/agents');
      expect(uiRes.status()).toBe(200);
      const uiBody = await uiRes.json() as {
        data: {
          agents: Array<{
            agent_id: string;
            current_goal: string;
            session: string;
          }>;
        };
      };

      expect(uiBody.data.agents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            agent_id: 'goal-engine-research',
            current_goal: goalTitle,
            session: 'research',
          }),
          expect.objectContaining({
            agent_id: 'goal-engine-demo',
            current_goal: '当前还没有活动目标',
          }),
        ])
      );
    } finally {
      restoreRuntimeState(previousRuntimeState);
    }
  });

  test('reflects an explicit replacement goal in /ui after an active-goal conflict', async ({ request, baseURL }) => {
    const previousRuntimeState = safeRead(runtimeStatePath);

    try {
      const existingGoalRes = await request.get('/api/v1/goals/current');
      if (existingGoalRes.status() === 200) {
        const existingGoalBody = await existingGoalRes.json() as {
          data: { id: string };
        };
        const closeGoalRes = await request.patch(`/api/v1/goals/${existingGoalBody.data.id}`, {
          data: { status: 'completed' },
        });
        expect(closeGoalRes.status()).toBe(200);
      }

      await execFileAsync('pnpm', [
        'openclaw',
        'bootstrap',
        '--service-url',
        String(baseURL),
      ], {
        cwd: agentAdapterDir,
        env: {
          ...process.env,
          OPENCLAW_AGENT_ID: 'goal-engine-demo',
          OPENCLAW_AGENT_NAME: 'goal-engine-demo',
          OPENCLAW_WORKSPACE: 'goal-engine',
          OPENCLAW_SESSION: 'main',
        },
      });

      const firstGoalRes = await request.post('/api/v1/goals', {
        data: {
          title: `Existing goal ${Date.now()}`,
          success_criteria: ['Trigger an active-goal conflict'],
          stop_conditions: [],
          current_stage: 'candidate-validation',
        },
      });
      expect(firstGoalRes.status()).toBe(201);
      const firstGoalBody = await firstGoalRes.json() as GoalCreateResponse;

      const replacementTitle = `Replacement goal ${Date.now()}`;
      const replacementGoalRes = await request.post('/api/v1/goals', {
        data: {
          title: replacementTitle,
          success_criteria: ['Replace the current goal explicitly'],
          stop_conditions: [],
          current_stage: 'lead-search',
          replace_active: true,
        },
      });
      expect(replacementGoalRes.status()).toBe(201);
      const replacementGoalBody = await replacementGoalRes.json() as {
        data: {
          id: string;
          title: string;
          replaced_goal?: {
            id: string;
            title: string;
            status: string;
          };
        };
      };
      expect(replacementGoalBody.data.title).toBe(replacementTitle);
      expect(replacementGoalBody.data.replaced_goal).toEqual({
        id: firstGoalBody.data.id,
        title: firstGoalBody.data.title,
        status: 'abandoned',
      });

      const uiRes = await request.get('/api/v1/ui/agents');
      expect(uiRes.status()).toBe(200);
      const uiBody = await uiRes.json() as {
        data: {
          agents: Array<{
            agent_id: string;
            current_goal: string;
          }>;
        };
      };
      expect(uiBody.data.agents).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            agent_id: 'goal-engine-demo',
            current_goal: replacementTitle,
          }),
        ])
      );

      const detailRes = await request.get('/api/v1/ui/agents/goal-engine-demo');
      expect(detailRes.status()).toBe(200);
      const detailBody = await detailRes.json() as {
        data: {
          header: {
            current_goal: string | null;
          };
          current_state: {
            goal_title: string;
            current_stage: string;
          };
          goal_history: Array<{
            goal_id: string;
            goal_title: string;
            status: string;
          }>;
        };
      };
      expect(detailBody.data.header.current_goal).toBe(replacementTitle);
      expect(detailBody.data.current_state.goal_title).toBe(replacementTitle);
      expect(detailBody.data.current_state.current_stage).toBe('lead-search');
      expect(detailBody.data.goal_history).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            goal_id: firstGoalBody.data.id,
            goal_title: firstGoalBody.data.title,
            status: 'abandoned',
          }),
          expect.objectContaining({
            goal_id: replacementGoalBody.data.id,
            goal_title: replacementTitle,
            status: 'active',
          }),
        ])
      );
    } finally {
      restoreRuntimeState(previousRuntimeState);
    }
  });
});

function safeRead(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf-8');
  } catch {
    return undefined;
  }
}

function restoreRuntimeState(previous: string | undefined): void {
  if (previous === undefined) {
    rmSync(runtimeStatePath, { force: true });
    return;
  }

  writeFileSync(runtimeStatePath, previous, 'utf-8');
}
