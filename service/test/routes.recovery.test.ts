import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb } from './helpers.js';
import { createApp } from '../src/app.js';

let app: ReturnType<typeof createApp>;
let goalId: string;

beforeEach(async () => {
  const db = makeTestDb();
  app = createApp(db);
});

describe('GET /api/v1/recovery-packet', () => {
  it('returns 404 when goal_id does not exist', async () => {
    const res = await app.request('/api/v1/recovery-packet?goal_id=nonexistent');
    expect(res.status).toBe(404);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('not_found');
  });

  it('returns derived recovery packet', async () => {
    const goalRes = await app.request('/api/v1/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '恢复测试目标',
        success_criteria: ['条件A'],
        stop_conditions: [],
        current_stage: 'research',
      }),
    });
    goalId = ((await goalRes.json()) as { data: { id: string } }).data.id;

    const res = await app.request(`/api/v1/recovery-packet?goal_id=${goalId}`);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      data: {
        goal_id: string;
        goal_title: string;
        current_stage: string;
        success_criteria: string[];
        avoid_strategies: string[];
        generated_at: string;
      };
    };
    expect(body.data.goal_id).toBe(goalId);
    expect(body.data.goal_title).toBe('恢复测试目标');
    expect(body.data.current_stage).toBe('research');
    expect(body.data.success_criteria).toEqual(['条件A']);
    expect(body.data.avoid_strategies).toEqual([]);
    expect(body.data.generated_at).toBeDefined();
  });

  it('persists recovery events for later UI evidence', async () => {
    const goalRes = await app.request('/api/v1/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '恢复事件测试目标',
        success_criteria: ['条件A'],
        stop_conditions: [],
        current_stage: 'research',
      }),
    });
    goalId = ((await goalRes.json()) as { data: { id: string } }).data.id;

    const res = await app.request(`/api/v1/recovery-packet?goal_id=${goalId}`);
    expect(res.status).toBe(200);

    const detailRes = await app.request('/api/v1/ui/agents/goal-engine-demo');
    expect(detailRes.status).toBe(200);
    const detailBody = await detailRes.json() as {
      data: {
        timeline: Array<{
          type: string;
          summary: string;
        }>;
        system_gaps: Array<{
          key: string;
          status: string;
        }>;
      };
    };

    expect(detailBody.data.timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'recovery',
          summary: '已恢复 恢复事件测试目标',
        }),
      ])
    );
    expect(detailBody.data.system_gaps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'recovery_history',
          status: 'covered',
        }),
      ])
    );
  });

  it('persists projection-sourced recovery events distinctly when requested', async () => {
    const goalRes = await app.request('/api/v1/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Projection 恢复测试目标',
        success_criteria: ['条件A'],
        stop_conditions: [],
        current_stage: 'research',
      }),
    });
    goalId = ((await goalRes.json()) as { data: { id: string } }).data.id;

    const res = await app.request(`/api/v1/recovery-packet?goal_id=${goalId}&source=projection`);
    expect(res.status).toBe(200);

    const detailRes = await app.request('/api/v1/ui/agents/goal-engine-demo');
    expect(detailRes.status).toBe(200);
    const detailBody = await detailRes.json() as {
      data: {
        timeline: Array<{
          type: string;
          impact: string;
        }>;
      };
    };

    expect(detailBody.data.timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'recovery',
          impact: expect.stringContaining('来源：projection'),
        }),
      ])
    );
  });
});
