import { test, expect } from '@playwright/test';

type GoalCreateResponse = {
  data: {
    id: string;
    status: string;
  };
};

type AttemptCreateResponse = {
  data: {
    id: string;
  };
};

test.describe('Goal Engine API E2E', () => {
  test('runs the behavior change loop against a real service process', async ({ request }) => {
    const existingGoalRes = await request.get('/api/v1/goals/current');
    if (existingGoalRes.status() === 200) {
      const existingGoalBody = await existingGoalRes.json() as { data: { id: string } };
      const closeGoalRes = await request.patch(`/api/v1/goals/${existingGoalBody.data.id}`, {
        data: { status: 'completed' },
      });
      expect(closeGoalRes.status()).toBe(200);
    }

    const goalRes = await request.post('/api/v1/goals', {
      data: {
        title: `E2E Goal ${Date.now()}`,
        success_criteria: ['定位到根因', '提出解决方案'],
        stop_conditions: ['超过 10 次失败'],
        current_stage: 'investigation',
      },
    });
    expect(goalRes.status()).toBe(201);
    const goalBody = await goalRes.json() as GoalCreateResponse;
    expect(goalBody.data.status).toBe('active');

    const attemptRes = await request.post('/api/v1/attempts', {
      data: {
        goal_id: goalBody.data.id,
        stage: 'investigation',
        action_taken: '使用宽泛关键词搜索网络，未找到具体答案',
        strategy_tags: ['broad-web-search'],
        result: 'failure',
        failure_type: 'tool_error',
      },
    });
    expect(attemptRes.status()).toBe(201);
    const attemptBody = await attemptRes.json() as AttemptCreateResponse;

    const reflectionRes = await request.post('/api/v1/reflections', {
      data: {
        goal_id: goalBody.data.id,
        attempt_id: attemptBody.data.id,
        summary: '宽泛搜索无法定位到具体的 API 限流文档',
        root_cause: '搜索范围太广，信噪比太低',
        must_change: '切换到官方 API 文档，narrowed-scope 策略',
        avoid_strategy: 'broad-web-search',
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
    expect(reflectionBody.data.policy.avoid_strategies).toContain('broad-web-search');
    expect(reflectionBody.data.policy.preferred_next_step).toBeTruthy();

    const blockedRes = await request.post('/api/v1/retry-guard/check', {
      data: {
        goal_id: goalBody.data.id,
        planned_action: '再次使用宽泛搜索',
        what_changed: '',
        strategy_tags: ['broad-web-search'],
        policy_acknowledged: true,
      },
    });
    expect(blockedRes.status()).toBe(200);
    const blockedBody = await blockedRes.json() as {
      data: {
        allowed: boolean;
        reason: string;
      };
    };
    expect(blockedBody.data.allowed).toBe(false);
    expect(blockedBody.data.reason).toBe('blocked_strategy_overlap');

    const allowedRes = await request.post('/api/v1/retry-guard/check', {
      data: {
        goal_id: goalBody.data.id,
        planned_action: '查阅官方 API 文档的限流章节',
        what_changed: '切换到官方文档，narrowed-scope 策略',
        strategy_tags: ['official-docs', 'narrowed-scope'],
        policy_acknowledged: true,
      },
    });
    expect(allowedRes.status()).toBe(200);
    const allowedBody = await allowedRes.json() as {
      data: {
        allowed: boolean;
        reason: string;
      };
    };
    expect(allowedBody.data.allowed).toBe(true);
    expect(allowedBody.data.reason).toBe('allowed');

    const recoveryRes = await request.get(`/api/v1/recovery-packet?goal_id=${goalBody.data.id}`);
    expect(recoveryRes.status()).toBe(200);
    const recoveryBody = await recoveryRes.json() as {
      data: {
        goal_id: string;
        avoid_strategies: string[];
        generated_at: string;
      };
    };
    expect(recoveryBody.data.goal_id).toBe(goalBody.data.id);
    expect(recoveryBody.data.avoid_strategies).toContain('broad-web-search');
    expect(recoveryBody.data.generated_at).toBeTruthy();
  });

  test('returns stable contract errors for missing resources', async ({ request }) => {
    const currentGoalRes = await request.get('/api/v1/goals/current');
    if (currentGoalRes.status() === 200) {
      const currentGoalBody = await currentGoalRes.json() as { data: { id: string } };
      const closeGoalRes = await request.patch(`/api/v1/goals/${currentGoalBody.data.id}`, {
        data: { status: 'completed' },
      });
      expect(closeGoalRes.status()).toBe(200);
    }

    const missingAttemptRes = await request.post('/api/v1/attempts', {
      data: {
        goal_id: 'missing-goal',
        stage: 'research',
        action_taken: '搜索',
        strategy_tags: ['official-docs'],
        result: 'success',
      },
    });
    expect(missingAttemptRes.status()).toBe(404);
    await expect(missingAttemptRes.json()).resolves.toEqual({
      error: {
        code: 'not_found',
        message: 'Goal not found',
      },
    });

    const missingGoalRetryRes = await request.post('/api/v1/retry-guard/check', {
      data: {
        goal_id: 'missing-goal',
        planned_action: '搜索',
        what_changed: '切换路径',
        strategy_tags: ['official-docs'],
        policy_acknowledged: true,
      },
    });
    expect(missingGoalRetryRes.status()).toBe(404);
    await expect(missingGoalRetryRes.json()).resolves.toEqual({
      error: {
        code: 'not_found',
        message: 'Goal not found',
      },
    });

    const noPolicyGoalRes = await request.post('/api/v1/goals', {
      data: {
        title: `No Policy Goal ${Date.now()}`,
        success_criteria: ['完成目标'],
        stop_conditions: [],
        current_stage: 'research',
      },
    });
    expect(noPolicyGoalRes.status()).toBe(201);
    const noPolicyGoalBody = await noPolicyGoalRes.json() as GoalCreateResponse;

    const noPolicyRetryRes = await request.post('/api/v1/retry-guard/check', {
      data: {
        goal_id: noPolicyGoalBody.data.id,
        planned_action: '搜索',
        what_changed: '切换路径',
        strategy_tags: ['official-docs'],
        policy_acknowledged: true,
      },
    });
    expect(noPolicyRetryRes.status()).toBe(404);
    await expect(noPolicyRetryRes.json()).resolves.toEqual({
      error: {
        code: 'no_policy_yet',
        message: 'No policy exists for this goal yet',
      },
    });

    const missingRecoveryRes = await request.get('/api/v1/recovery-packet?goal_id=missing-goal');
    expect(missingRecoveryRes.status()).toBe(404);
    await expect(missingRecoveryRes.json()).resolves.toEqual({
      error: {
        code: 'not_found',
        message: 'Goal not found',
      },
    });
  });
});
