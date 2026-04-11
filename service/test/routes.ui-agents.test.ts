import { beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app.js';
import { makeTestDb } from './helpers.js';

type AgentListResponse = {
  data: {
    agents: Array<{
      agent_id: string;
      name: string;
      current_goal: string;
      workspace: string;
      session: string;
      managed: boolean;
      learning_verdict: {
        level: 'none' | 'partial' | 'clear' | 'stalled';
        label: string;
        reason: string;
      };
      last_active_at: string;
      recent_change_summary: string;
    }>;
  };
};

type AgentDetailResponse = {
  data: {
    header: {
      agent_id: string;
      name: string;
      current_goal: string | null;
      status: string;
      last_active_at: string;
      workspace: string;
      session: string;
    };
    managed_status: {
      managed: boolean;
      reason: string;
    };
    learning_verdict: {
      overall: {
        level: 'none' | 'partial' | 'clear' | 'stalled';
        label: string;
        reason: string;
        evidence_event_ids: string[];
      };
      behavior_changed: {
        status: 'yes' | 'no' | 'partial';
        reason: string;
        evidence_event_ids: string[];
      };
      repeat_errors_reduced: {
        status: 'yes' | 'no' | 'partial';
        reason: string;
        evidence_event_ids: string[];
      };
      memory_preserved: {
        status: 'yes' | 'no' | 'partial';
        reason: string;
        evidence_event_ids: string[];
      };
    };
    current_state: {
      goal_title: string;
      current_stage: string;
      current_guidance: string | null;
      avoid_strategies: string[];
      recommended_next_step: string | null;
      current_risk: string | null;
      last_path: string | null;
      next_path: string | null;
      why_different: string | null;
      forbidden_paths: string[];
    };
    goal_history: Array<{
      goal_id: string;
      goal_title: string;
      status: string;
      current_stage: string;
      workspace: string;
      session: string;
      first_seen_at: string;
      last_seen_at: string;
      last_event: string;
    }>;
    timeline: Array<{
      id: string;
      timestamp: string;
      type: 'failure' | 'reflection' | 'policy_update' | 'retry_check' | 'recovery' | 'progress' | 'projection_notice';
      title: string;
      summary: string;
      impact: string;
      linked_ids: string[];
    }>;
    system_gaps: Array<{
      key: string;
      label: string;
      status: 'covered' | 'partial' | 'missing';
      detail: string;
    }>;
  };
};

let app: ReturnType<typeof createApp>;
let defaultRuntimeStatePath: string;
const fixtureWorkspaceStatePath = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../.openclaw/workspace-state.json'
);

describe('UI agent routes', () => {
  beforeEach(() => {
    const runtimeStateDir = mkdtempSync(join(tmpdir(), 'goal-engine-runtime-state-'));
    defaultRuntimeStatePath = join(runtimeStateDir, 'runtime-state.json');
    writeFileSync(defaultRuntimeStatePath, JSON.stringify({}), 'utf-8');
    app = createApp(makeTestDb(), {
      ui: {
        workspaceStatePath: fixtureWorkspaceStatePath,
        runtimeStatePath: defaultRuntimeStatePath,
      },
    });
  });

  it('returns managed OpenClaw agents even before any active goal exists', async () => {
    const res = await app.request('/api/v1/ui/agents');

    expect(res.status).toBe(200);
    const body = (await res.json()) as AgentListResponse;

    expect(body.data.agents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agent_id: 'goal-engine-demo',
          name: 'goal-engine-demo',
          current_goal: '当前还没有活动目标',
          managed: true,
        }),
        expect.objectContaining({
          agent_id: 'goal-engine-research',
          name: 'goal-engine-research',
          current_goal: '当前还没有活动目标',
          managed: true,
        }),
      ])
    );
  });

  it('returns a managed-agent detail even when that agent has no active goal attached', async () => {
    const detailRes = await app.request('/api/v1/ui/agents/goal-engine-research');

    expect(detailRes.status).toBe(200);
    const detailBody = (await detailRes.json()) as AgentDetailResponse;

    expect(detailBody.data.header).toEqual(
      expect.objectContaining({
        agent_id: 'goal-engine-research',
        name: 'goal-engine-research',
        current_goal: null,
        workspace: expect.any(String),
        session: expect.any(String),
      })
    );
    expect(detailBody.data.managed_status).toEqual(
      expect.objectContaining({
        managed: true,
      })
    );
    expect(detailBody.data.current_state).toEqual(
      expect.objectContaining({
        goal_title: '当前还没有活动目标',
        current_stage: 'idle',
      })
    );
    expect(detailBody.data.goal_history).toEqual([]);
    expect(detailBody.data.timeline).toEqual([]);
    expect(detailBody.data.system_gaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'conversation_goal_alignment',
          status: 'partial',
        }),
      ])
    );
  });

  it('prefers runtime-state over workspace-state for the current managed agent', async () => {
    const runtimeStateDir = mkdtempSync(join(tmpdir(), 'goal-engine-runtime-state-'));
    const runtimeStatePath = join(runtimeStateDir, 'runtime-state.json');
    writeFileSync(
      runtimeStatePath,
      JSON.stringify({
        goalEngine: {
          currentManagedAgentId: 'goal-engine-research',
          managedAgents: [
            {
              agentId: 'goal-engine-demo',
              agentName: 'goal-engine-demo',
              workspace: 'goal-engine',
              session: 'main',
              managed: true,
            },
            {
              agentId: 'goal-engine-research',
              agentName: 'goal-engine-research',
              workspace: 'goal-engine',
              session: 'research',
              managed: true,
            },
          ],
        },
      }),
      'utf-8'
    );

    const runtimeApp = createApp(makeTestDb(), {
      ui: {
        workspaceStatePath: fixtureWorkspaceStatePath,
        runtimeStatePath,
      },
    });

    const goalRes = await runtimeApp.request('/api/v1/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Runtime managed agent journey',
        success_criteria: ['Attach active goal to runtime-selected agent'],
        stop_conditions: [],
        current_stage: 'integration',
      }),
    });
    expect(goalRes.status).toBe(201);

    const listRes = await runtimeApp.request('/api/v1/ui/agents');
    const listBody = (await listRes.json()) as AgentListResponse;

    expect(listBody.data.agents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agent_id: 'goal-engine-research',
          current_goal: 'Runtime managed agent journey',
        }),
        expect.objectContaining({
          agent_id: 'goal-engine-demo',
          current_goal: '当前还没有活动目标',
        }),
      ])
    );

    const detailRes = await runtimeApp.request('/api/v1/ui/agents/goal-engine-research');
    expect(detailRes.status).toBe(200);
    const detailBody = (await detailRes.json()) as AgentDetailResponse;
    expect(detailBody.data.header).toEqual(
      expect.objectContaining({
        agent_id: 'goal-engine-research',
        current_goal: 'Runtime managed agent journey',
        session: 'research',
      })
    );
    expect(detailBody.data.goal_history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          goal_id: expect.any(String),
          goal_title: 'Runtime managed agent journey',
          last_event: 'goal_started',
          session: 'research',
        }),
      ])
    );
  });

  it('returns a no-evidence detail view for a newly started goal', async () => {
    const goalRes = await app.request('/api/v1/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Track an agent journey',
        success_criteria: ['Show the current state clearly'],
        stop_conditions: [],
        current_stage: 'exploration',
      }),
    });
    const goalId = ((await goalRes.json()) as { data: { id: string } }).data.id;

    const listRes = await app.request('/api/v1/ui/agents');
    const listBody = (await listRes.json()) as AgentListResponse;

    expect(listBody.data.agents).toEqual([
      expect.objectContaining({
        agent_id: 'goal-engine-demo',
        name: 'goal-engine-demo',
        current_goal: 'Track an agent journey',
        managed: true,
        learning_verdict: expect.objectContaining({
          level: 'none',
          label: '暂无证据',
        }),
      }),
      expect.objectContaining({
        agent_id: 'goal-engine-research',
        name: 'goal-engine-research',
        current_goal: '当前还没有活动目标',
      }),
    ]);

    const detailRes = await app.request('/api/v1/ui/agents/goal-engine-demo');

    expect(detailRes.status).toBe(200);
    const detailBody = (await detailRes.json()) as AgentDetailResponse;

    expect(detailBody.data.header).toEqual(
      expect.objectContaining({
        agent_id: 'goal-engine-demo',
        name: 'goal-engine-demo',
        current_goal: 'Track an agent journey',
        status: 'active',
        workspace: expect.any(String),
        session: expect.any(String),
      })
    );
    expect(detailBody.data.managed_status).toEqual(
      expect.objectContaining({
        managed: true,
      })
    );
    expect(detailBody.data.learning_verdict.overall).toEqual(
      expect.objectContaining({
        level: 'none',
        label: '暂无证据',
      })
    );
    expect(detailBody.data.current_state).toEqual(
      expect.objectContaining({
        goal_title: 'Track an agent journey',
        current_stage: 'exploration',
        current_guidance: null,
        avoid_strategies: [],
      })
    );
    expect(detailBody.data.goal_history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          goal_title: 'Track an agent journey',
          last_event: 'goal_started',
          session: expect.any(String),
        }),
      ])
    );
    expect(detailBody.data.timeline).toEqual([]);
    expect(detailBody.data.system_gaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'agent_goal_history',
          status: 'covered',
        }),
        expect.objectContaining({
          key: 'retry_history',
          status: 'missing',
        }),
        expect.objectContaining({
          key: 'recovery_history',
          status: 'missing',
        }),
      ])
    );
  });

  it('returns a partial-improvement detail when a failure has become new guidance', async () => {
    const goalRes = await app.request('/api/v1/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Partial improvement journey',
        success_criteria: ['Turn failure into strategy'],
        stop_conditions: [],
        current_stage: 'integration',
      }),
    });
    const goalId = ((await goalRes.json()) as { data: { id: string } }).data.id;

    const attemptRes = await app.request('/api/v1/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: goalId,
        stage: 'integration',
        action_taken: 'Repeated the same path again',
        strategy_tags: ['repeat'],
        result: 'failure',
        failure_type: 'stuck_loop',
      }),
    });
    const attemptId = ((await attemptRes.json()) as { data: { id: string } }).data.id;

    await app.request('/api/v1/reflections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: goalId,
        attempt_id: attemptId,
        summary: 'Repeated the same path again',
        root_cause: 'No new input before retry',
        must_change: 'Explain what changed before retrying',
        avoid_strategy: 'repeat',
      }),
    });

    const detailRes = await app.request('/api/v1/ui/agents/goal-engine-demo');
    const body = (await detailRes.json()) as AgentDetailResponse;

    expect(body.data.learning_verdict.overall).toEqual(
      expect.objectContaining({
        level: 'partial',
        label: '部分改善',
      })
    );
    expect(body.data.timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'failure' }),
        expect.objectContaining({ type: 'reflection' }),
        expect.objectContaining({ type: 'policy_update' }),
      ])
    );
    expect(body.data.current_state).toEqual(
      expect.objectContaining({
        current_guidance: 'Explain what changed before retrying',
        avoid_strategies: ['repeat'],
        recommended_next_step: 'Explain what changed before retrying',
        last_path: 'repeat',
        next_path: 'repeat',
        why_different: '当前 guidance 要求：Explain what changed before retrying',
        forbidden_paths: ['repeat'],
      })
    );
  });

  it('surfaces stale local projection as observable evidence when service active goal has changed', async () => {
    const projectionDir = mkdtempSync(join(tmpdir(), 'goal-engine-projection-'));
    mkdirSync(projectionDir, { recursive: true });
    writeFileSync(
      join(projectionDir, 'current-goal.md'),
      [
        '# Current Goal',
        '',
        '> 更新时间：2026-04-09T01:39:11.016Z',
        '',
        '## 目标',
        '',
        '旧的静安区临时办公目标',
      ].join('\n'),
      'utf-8'
    );
    writeFileSync(
      join(projectionDir, 'current-policy.md'),
      [
        '# Current Policy',
        '',
        '> 更新时间：2026-04-09T01:39:11.011Z',
      ].join('\n'),
      'utf-8'
    );
    writeFileSync(
      join(projectionDir, 'recovery-packet.md'),
      [
        '# Recovery Packet',
        '',
        '> 生成时间：2026-04-09T01:39:11.016Z',
      ].join('\n'),
      'utf-8'
    );

    const projectionApp = createApp(makeTestDb(), {
      ui: {
        workspaceStatePath: fixtureWorkspaceStatePath,
        projectionDir,
        runtimeStatePath: defaultRuntimeStatePath,
      },
    });

    const goalRes = await projectionApp.request('/api/v1/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '新的张江办公室电话目标',
        success_criteria: ['Observe stale projection drift'],
        stop_conditions: [],
        current_stage: 'candidate-validation',
      }),
    });
    expect(goalRes.status).toBe(201);

    const detailRes = await projectionApp.request('/api/v1/ui/agents/goal-engine-demo');
    expect(detailRes.status).toBe(200);
    const body = (await detailRes.json()) as AgentDetailResponse;

    expect(body.data.learning_verdict.overall).toEqual(
      expect.objectContaining({
        level: 'partial',
        label: '观察到偏差',
      })
    );
    expect(body.data.current_state).toEqual(
      expect.objectContaining({
        current_risk: 'Service active goal changed, but the local projection summary is stale.',
      })
    );
    expect(body.data.timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'projection_notice',
          title: '投影未对齐',
          summary: '本地 projection 仍指向旧目标。',
          impact: expect.stringContaining('service="新的张江办公室电话目标"'),
        }),
      ])
    );

    const listRes = await projectionApp.request('/api/v1/ui/agents');
    const listBody = (await listRes.json()) as AgentListResponse;
    expect(listBody.data.agents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agent_id: 'goal-engine-demo',
          learning_verdict: expect.objectContaining({
            level: 'partial',
            label: '观察到偏差',
          }),
          recent_change_summary: '本地 projection 仍指向旧目标。',
        }),
      ])
    );
  });

  it('prefers the latest runtime event when reporting current risk and recent change summary', async () => {
    const goalRes = await app.request('/api/v1/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Latest runtime event wins',
        success_criteria: ['Render the newest runtime event'],
        stop_conditions: [],
        current_stage: 'monitoring',
      }),
    });
    expect(goalRes.status).toBe(201);

    writeFileSync(
      defaultRuntimeStatePath,
      JSON.stringify(
        {
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
            runtimeEvents: {
              'goal-engine-demo': [
                {
                  id: 'aligned-latest',
                  kind: 'show_goal_status',
                  status: 'ok',
                  title: '对齐确认',
                  summary: '最新对齐事件应该被优先展示。',
                  detail: 'latest aligned event',
                  createdAt: '2026-04-09T13:52:00.000Z',
                },
                {
                  id: 'blocked-old',
                  kind: 'show_goal_status',
                  status: 'blocked',
                  title: '对齐阻塞',
                  summary: '旧的阻塞事件不应覆盖最新状态。',
                  detail: 'old blocked event',
                  createdAt: '2026-04-09T13:51:00.000Z',
                },
              ],
            },
          },
        },
        null,
        2
      ),
      'utf-8'
    );

    const detailRes = await app.request('/api/v1/ui/agents/goal-engine-demo');
    expect(detailRes.status).toBe(200);
    const body = (await detailRes.json()) as AgentDetailResponse;

    expect(body.data.current_state.current_risk).toBeNull();
    expect(body.data.timeline[0]).toEqual(
      expect.objectContaining({
        id: 'runtime:aligned-latest',
        title: '对齐确认',
        summary: '最新对齐事件应该被优先展示。',
      })
    );

    const listRes = await app.request('/api/v1/ui/agents');
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as AgentListResponse;
    expect(listBody.data.agents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agent_id: 'goal-engine-demo',
          recent_change_summary: '最新对齐事件应该被优先展示。',
        }),
      ])
    );
  });

  it('returns a clear-improvement detail when later behavior changes after guidance', async () => {
    const goalRes = await app.request('/api/v1/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Clear improvement journey',
        success_criteria: ['Change behavior after reflection'],
        stop_conditions: [],
        current_stage: 'integration',
      }),
    });
    const goalId = ((await goalRes.json()) as { data: { id: string } }).data.id;

    const failureRes = await app.request('/api/v1/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: goalId,
        stage: 'integration',
        action_taken: 'Repeated the same path again',
        strategy_tags: ['repeat'],
        result: 'failure',
        failure_type: 'stuck_loop',
      }),
    });
    const attemptId = ((await failureRes.json()) as { data: { id: string } }).data.id;

    await app.request('/api/v1/reflections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: goalId,
        attempt_id: attemptId,
        summary: 'Repeated the same path again',
        root_cause: 'No new input before retry',
        must_change: 'Take a different route',
        avoid_strategy: 'repeat',
      }),
    });

    await app.request('/api/v1/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: goalId,
        stage: 'integration',
        action_taken: 'Changed the approach and gathered new evidence',
        strategy_tags: ['research'],
        result: 'partial',
      }),
    });

    const detailRes = await app.request('/api/v1/ui/agents/goal-engine-demo');
    const body = (await detailRes.json()) as AgentDetailResponse;

    expect(body.data.learning_verdict.overall).toEqual(
      expect.objectContaining({
        level: 'clear',
        label: '明显改善',
      })
    );
    expect(body.data.timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'progress',
          summary: expect.stringContaining('Changed the approach'),
        }),
      ])
    );
    expect(body.data.current_state).toEqual(
      expect.objectContaining({
        last_path: 'research',
        why_different: '本轮路径从 repeat 切到 research。',
        forbidden_paths: ['repeat'],
      })
    );
  });

  it('shows real path change when retry guidance leads to a different failed path', async () => {
    const goalRes = await app.request('/api/v1/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Path change without success yet',
        success_criteria: ['Observe changed path even if still blocked'],
        stop_conditions: [],
        current_stage: 'candidate-validation',
      }),
    });
    const goalId = ((await goalRes.json()) as { data: { id: string } }).data.id;

    const firstAttemptRes = await app.request('/api/v1/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: goalId,
        stage: 'candidate-validation',
        action_taken: 'web_search unavailable',
        strategy_tags: ['web_search'],
        result: 'failure',
        failure_type: 'tool_unavailable',
      }),
    });
    const firstAttemptId = ((await firstAttemptRes.json()) as { data: { id: string } }).data.id;

    await app.request('/api/v1/reflections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: goalId,
        attempt_id: firstAttemptId,
        summary: 'web_search unavailable',
        root_cause: 'Search channel is blocked in this environment',
        must_change: 'Switch to multi-search-engine instead of repeating web_search',
        avoid_strategy: 'web_search',
      }),
    });

    await app.request('/api/v1/retry-guard/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: goalId,
        planned_action: 'Switch to multi-search-engine and validate one candidate only',
        what_changed: 'Use multi-search-engine instead of web_search.',
        strategy_tags: ['multi-search-engine'],
        policy_acknowledged: true,
      }),
    });

    await app.request('/api/v1/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: goalId,
        stage: 'candidate-validation',
        action_taken: 'multi-search-engine still returned weak leads',
        strategy_tags: ['multi-search-engine'],
        result: 'failure',
        failure_type: 'validation_fail',
      }),
    });

    const detailRes = await app.request('/api/v1/ui/agents/goal-engine-demo');
    expect(detailRes.status).toBe(200);
    const body = (await detailRes.json()) as AgentDetailResponse;

    expect(body.data.learning_verdict.behavior_changed).toEqual(
      expect.objectContaining({
        status: 'yes',
      })
    );
    expect(body.data.learning_verdict.overall).toEqual(
      expect.objectContaining({
        level: 'clear',
        label: '明显改善',
      })
    );
    expect(body.data.current_state).toEqual(
      expect.objectContaining({
        last_path: 'multi-search-engine',
        next_path: 'multi-search-engine',
        why_different: 'Use multi-search-engine instead of web_search.',
        forbidden_paths: ['web_search'],
      })
    );
  });

  it('shows goal history for the real managed agent across multiple goals', async () => {
    const firstGoalRes = await app.request('/api/v1/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'First managed goal',
        success_criteria: ['Finish one tracked goal'],
        stop_conditions: [],
        current_stage: 'integration',
      }),
    });
    const firstGoalId = ((await firstGoalRes.json()) as { data: { id: string } }).data.id;

    await app.request(`/api/v1/goals/${firstGoalId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'completed',
      }),
    });

    const secondGoalRes = await app.request('/api/v1/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Second managed goal',
        success_criteria: ['Track the current goal too'],
        stop_conditions: [],
        current_stage: 'execution',
      }),
    });
    expect(secondGoalRes.status).toBe(201);

    const detailRes = await app.request('/api/v1/ui/agents/goal-engine-demo');
    expect(detailRes.status).toBe(200);
    const body = (await detailRes.json()) as AgentDetailResponse;

    expect(body.data.goal_history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          goal_id: firstGoalId,
          goal_title: 'First managed goal',
          status: 'completed',
          session: expect.any(String),
        }),
        expect.objectContaining({
          goal_title: 'Second managed goal',
          status: 'active',
          current_stage: 'execution',
          session: expect.any(String),
          last_event: 'goal_started',
        }),
      ])
    );
    expect(body.data.system_gaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'agent_goal_history',
          status: 'covered',
        }),
      ])
    );
  });

  it('switches the UI to the replacement goal after an explicit replace_active start', async () => {
    const firstGoalRes = await app.request('/api/v1/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Old active goal',
        success_criteria: ['Keep the old goal visible'],
        stop_conditions: [],
        current_stage: 'candidate-validation',
      }),
    });
    expect(firstGoalRes.status).toBe(201);
    const firstGoalId = ((await firstGoalRes.json()) as { data: { id: string } }).data.id;

    const replacementRes = await app.request('/api/v1/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Replacement goal',
        success_criteria: ['Make the new goal the active one'],
        stop_conditions: [],
        current_stage: 'lead-search',
        replace_active: true,
      }),
    });
    expect(replacementRes.status).toBe(201);

    const listRes = await app.request('/api/v1/ui/agents');
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as AgentListResponse;
    expect(listBody.data.agents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agent_id: 'goal-engine-demo',
          current_goal: 'Replacement goal',
        }),
      ])
    );

    const detailRes = await app.request('/api/v1/ui/agents/goal-engine-demo');
    expect(detailRes.status).toBe(200);
    const detailBody = (await detailRes.json()) as AgentDetailResponse;
    expect(detailBody.data.header).toEqual(
      expect.objectContaining({
        current_goal: 'Replacement goal',
      })
    );
    expect(detailBody.data.current_state).toEqual(
      expect.objectContaining({
        goal_title: 'Replacement goal',
        current_stage: 'lead-search',
      })
    );
    expect(detailBody.data.goal_history).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          goal_id: firstGoalId,
          goal_title: 'Old active goal',
          status: 'abandoned',
        }),
        expect.objectContaining({
          goal_title: 'Replacement goal',
          status: 'active',
          current_stage: 'lead-search',
        }),
      ])
    );
  });

  it('uses persisted retry and recovery events as explicit learning evidence', async () => {
    const goalRes = await app.request('/api/v1/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Persisted evidence journey',
        success_criteria: ['Persist retry and recovery evidence'],
        stop_conditions: [],
        current_stage: 'integration',
      }),
    });
    const goalId = ((await goalRes.json()) as { data: { id: string } }).data.id;

    const attemptRes = await app.request('/api/v1/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: goalId,
        stage: 'integration',
        action_taken: 'Repeated the same path again',
        strategy_tags: ['repeat'],
        result: 'failure',
        failure_type: 'stuck_loop',
      }),
    });
    const attemptId = ((await attemptRes.json()) as { data: { id: string } }).data.id;

    await app.request('/api/v1/reflections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: goalId,
        attempt_id: attemptId,
        summary: 'Repeated the same path again',
        root_cause: 'No new input before retry',
        must_change: 'Take a different route',
        avoid_strategy: 'repeat',
      }),
    });

    await app.request('/api/v1/retry-guard/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: goalId,
        planned_action: '再次重复旧路径',
        what_changed: '',
        strategy_tags: ['repeat'],
        policy_acknowledged: true,
      }),
    });

    await app.request(`/api/v1/recovery-packet?goal_id=${goalId}`);

    const detailRes = await app.request('/api/v1/ui/agents/goal-engine-demo');
    const body = (await detailRes.json()) as AgentDetailResponse;

    expect(body.data.timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'retry_check' }),
        expect.objectContaining({ type: 'recovery' }),
      ])
    );
    expect(body.data.learning_verdict.repeat_errors_reduced).toEqual(
      expect.objectContaining({
        status: 'partial',
        evidence_event_ids: expect.arrayContaining([
          expect.stringMatching(/^retry:/),
        ]),
      })
    );
    expect(body.data.learning_verdict.memory_preserved).toEqual(
      expect.objectContaining({
        status: 'yes',
        evidence_event_ids: expect.arrayContaining([
          expect.stringMatching(/^recovery:/),
        ]),
      })
    );
    expect(body.data.system_gaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'retry_history',
          status: 'covered',
        }),
        expect.objectContaining({
          key: 'recovery_history',
          status: 'covered',
        }),
      ])
    );
  });

  it('returns a stalled detail when repeated failures keep happening without new progress', async () => {
    const goalRes = await app.request('/api/v1/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Stalled journey',
        success_criteria: ['Detect repeated failure patterns'],
        stop_conditions: [],
        current_stage: 'integration',
      }),
    });
    const goalId = ((await goalRes.json()) as { data: { id: string } }).data.id;

    await app.request('/api/v1/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: goalId,
        stage: 'integration',
        action_taken: 'Repeated the same path again',
        strategy_tags: ['repeat'],
        result: 'failure',
        failure_type: 'stuck_loop',
      }),
    });

    await app.request('/api/v1/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: goalId,
        stage: 'integration',
        action_taken: 'Repeated the same path again',
        strategy_tags: ['repeat'],
        result: 'failure',
        failure_type: 'stuck_loop',
      }),
    });

    const detailRes = await app.request('/api/v1/ui/agents/goal-engine-demo');
    const body = (await detailRes.json()) as AgentDetailResponse;

    expect(body.data.learning_verdict.overall).toEqual(
      expect.objectContaining({
        level: 'stalled',
        label: '停滞',
      })
    );
    expect(body.data.current_state.current_risk).toContain('repeated');
  });

  it('renders the gallery shell at /ui and the detail shell at /ui/agents/:agentId', async () => {
    const goalRes = await app.request('/api/v1/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Shell test goal',
        success_criteria: ['Render detail shell'],
        stop_conditions: [],
        current_stage: 'integration',
      }),
    });
    const goalId = ((await goalRes.json()) as { data: { id: string } }).data.id;

    const galleryRes = await app.request('/ui');
    expect(galleryRes.status).toBe(200);
    expect(galleryRes.headers.get('content-type')).toContain('text/html');
    const galleryHtml = await galleryRes.text();
    expect(galleryHtml).toContain('Goal Engine Agent 观察台');
    expect(galleryHtml).toContain('/api/v1/ui/agents');

    const detailRes = await app.request('/ui/agents/goal-engine-demo');
    expect(detailRes.status).toBe(200);
    const detailHtml = await detailRes.text();
    expect(detailHtml).toContain('Agent 学习详情');
    expect(detailHtml).toContain('/api/v1/ui/agents/goal-engine-demo');
    expect(detailHtml).toContain('Agent 概览');
    expect(detailHtml).toContain('关键进化');
    expect(detailHtml).toContain('查看进化全景');
    expect(detailHtml).toContain('更多信息');
    expect(detailHtml).toContain('const AUTO_REFRESH_INTERVAL_MS = 5000;');
    expect(detailHtml).toContain('document.visibilityState !== \'visible\'');
    expect(detailHtml).toContain('setInterval(async () =>');
  });

  it('surfaces a goal-alignment gate from runtime-state as an observable event', async () => {
    const runtimeStateDir = mkdtempSync(join(tmpdir(), 'goal-engine-runtime-state-'));
    const runtimeStatePath = join(runtimeStateDir, 'runtime-state.json');
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
          goalAlignmentSnapshots: {
            'goal-engine-demo': {
              status: 'blocked',
              expectedGoalTitle: '帮我在上海浦东张江找一个适合15-25人培训或路演的会议场地',
              activeGoalTitle: '帮我在上海浦东张江找到一个150-250平米、月租2-4万的办公室',
              projectionGoalTitle: '帮我在上海浦东张江找到一个150-250平米、月租2-4万的办公室',
              nextAction: 'Use start goal or replaceActiveGoal before continuing search.',
              checkedAt: '2026-04-09T23:28:00.000Z',
            },
          },
        },
      }),
      'utf-8'
    );

    const runtimeApp = createApp(makeTestDb(), {
      ui: {
        workspaceStatePath: fixtureWorkspaceStatePath,
        runtimeStatePath,
      },
    });

    const goalRes = await runtimeApp.request('/api/v1/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '帮我在上海浦东张江找到一个150-250平米、月租2-4万的办公室',
        success_criteria: ['拿到直拨电话'],
        stop_conditions: [],
        current_stage: 'goal-clarification',
      }),
    });
    expect(goalRes.status).toBe(201);

    const detailRes = await runtimeApp.request('/api/v1/ui/agents/goal-engine-demo');
    expect(detailRes.status).toBe(200);
    const detailBody = (await detailRes.json()) as AgentDetailResponse;

    expect(new Date(detailBody.data.header.last_active_at).getTime()).toBeGreaterThanOrEqual(
      new Date('2026-04-09T23:28:00.000Z').getTime()
    );
    expect(detailBody.data.learning_verdict.overall).toEqual(
      expect.objectContaining({
        level: 'partial',
        label: '观察到偏差',
      })
    );
    expect(detailBody.data.current_state).toEqual(
      expect.objectContaining({
        current_risk: 'OpenClaw 当前任务与 service active goal 尚未对齐。',
      })
    );
    expect(detailBody.data.timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'projection_notice',
          title: '目标未对齐',
          summary: 'OpenClaw 当前任务与 active goal 不一致。',
          impact: expect.stringContaining('expected="帮我在上海浦东张江找一个适合15-25人培训或路演的会议场地"'),
        }),
      ])
    );

    const listRes = await runtimeApp.request('/api/v1/ui/agents');
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as AgentListResponse;
    expect(listBody.data.agents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agent_id: 'goal-engine-demo',
          learning_verdict: expect.objectContaining({
            level: 'partial',
            label: '观察到偏差',
          }),
          recent_change_summary: 'OpenClaw 当前任务与 active goal 不一致。',
        }),
      ])
    );
    const listAgent = listBody.data.agents.find((agent) => agent.agent_id === 'goal-engine-demo');
    expect(listAgent).toBeTruthy();
    expect(new Date(listAgent!.last_active_at).getTime()).toBeGreaterThanOrEqual(
      new Date('2026-04-09T23:28:00.000Z').getTime()
    );
  });

  it('surfaces Goal Engine runtime events from runtime-state as observable evidence', async () => {
    const runtimeStateDir = mkdtempSync(join(tmpdir(), 'goal-engine-runtime-events-'));
    const runtimeStatePath = join(runtimeStateDir, 'runtime-state.json');
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
          goalAlignmentSnapshots: {},
          runtimeEvents: {
            'goal-engine-demo': [
              {
                id: 'show-goal-status:1',
                kind: 'show_goal_status',
                status: 'blocked',
                title: '对齐阻塞',
                summary: '当前任务“帮我在上海浦东张江找一个会议场地”尚未被 Goal Engine 接管。',
                detail: 'Execution permission: denied until the active goal is aligned.',
                createdAt: '2026-04-09T23:48:22.053Z',
              },
            ],
          },
        },
      }),
      'utf-8'
    );

    const runtimeApp = createApp(makeTestDb(), {
      ui: {
        workspaceStatePath: fixtureWorkspaceStatePath,
        runtimeStatePath,
      },
    });

    const detailRes = await runtimeApp.request('/api/v1/ui/agents/goal-engine-demo');
    expect(detailRes.status).toBe(200);
    const detailBody = (await detailRes.json()) as AgentDetailResponse;

    expect(detailBody.data.header.last_active_at).toBe('2026-04-09T23:48:22.053Z');
    expect(detailBody.data.learning_verdict.overall).toEqual(
      expect.objectContaining({
        level: 'partial',
        label: '观察到偏差',
      })
    );
    expect(detailBody.data.timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'runtime_signal',
          title: '对齐阻塞',
          summary: '当前任务“帮我在上海浦东张江找一个会议场地”尚未被 Goal Engine 接管。',
        }),
      ])
    );

    const listRes = await runtimeApp.request('/api/v1/ui/agents');
    expect(listRes.status).toBe(200);
    const listBody = (await listRes.json()) as AgentListResponse;
    expect(listBody.data.agents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          agent_id: 'goal-engine-demo',
          learning_verdict: expect.objectContaining({
            level: 'partial',
            label: '观察到偏差',
          }),
          last_active_at: '2026-04-09T23:48:22.053Z',
          recent_change_summary: '当前任务“帮我在上海浦东张江找一个会议场地”尚未被 Goal Engine 接管。',
        }),
      ])
    );
  });
});
