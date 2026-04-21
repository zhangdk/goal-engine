import { describe, expect, it, beforeEach } from 'vitest';
import { makeTestDb } from './helpers.js';
import { createApp } from '../src/app.js';

let app: ReturnType<typeof createApp>;
let goalId: string;

beforeEach(async () => {
  const db = makeTestDb();
  app = createApp(db);

  const res = await app.request('/api/v1/goals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: 'Validate direct outreach',
      success_criteria: ['A concrete reply exists'],
      stop_conditions: [],
      current_stage: 'channel-validation',
    }),
  });
  const body = await res.json() as { data: { id: string } };
  goalId = body.data.id;
});

describe('POST /api/v1/experiments', () => {
  async function createExperiment(status: 'planned' | 'active' = 'active') {
    const res = await app.request('/api/v1/experiments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: goalId,
        stage: 'channel-validation',
        hypothesis: 'Direct outreach will produce reply evidence faster than broad search',
        action_plan: 'Prepare 5 targeted outreach drafts',
        expected_signal: 'At least one concrete reply or permission boundary',
        cost_level: 'low',
        boundary_level: 'safe',
        why_different: 'Switches from broad search to buyer-specific outreach',
        status,
      }),
    });
    return res;
  }

  it('creates an experiment and lists it under the goal', async () => {
    const createRes = await createExperiment();

    expect(createRes.status).toBe(201);
    const createdBody = await createRes.json() as { data: { id: string; goal_id: string; status: string } };
    expect(createdBody.data.goal_id).toBe(goalId);
    expect(createdBody.data.status).toBe('active');

    const listRes = await app.request(`/api/v1/goals/${goalId}/experiments`);
    expect(listRes.status).toBe(200);
    expect(((await listRes.json()) as { data: unknown[] }).data).toHaveLength(1);
  });

  it('returns 404 when the goal does not exist', async () => {
    const res = await app.request('/api/v1/experiments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: 'missing-goal',
        stage: 'channel-validation',
        hypothesis: 'Try direct outreach',
        action_plan: 'Prepare targeted drafts',
        expected_signal: 'A reply',
        cost_level: 'low',
        boundary_level: 'safe',
        why_different: 'Different channel',
        status: 'planned',
      }),
    });

    expect(res.status).toBe(404);
  });

  it('returns 409 when creating a second active experiment for the goal', async () => {
    const firstRes = await createExperiment('active');
    expect(firstRes.status).toBe(201);

    const secondRes = await createExperiment('active');
    expect(secondRes.status).toBe(409);
    const body = await secondRes.json() as { error: { code: string; message: string } };
    expect(body.error).toEqual({
      code: 'active_experiment_conflict',
      message: 'An active experiment already exists for this goal',
    });
  });
});

describe('GET/PATCH /api/v1/experiments/:id', () => {
  async function createExperiment(status: 'planned' | 'active' = 'active') {
    const res = await app.request('/api/v1/experiments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: goalId,
        stage: 'channel-validation',
        hypothesis: 'Direct outreach will produce reply evidence faster than broad search',
        action_plan: 'Prepare 5 targeted outreach drafts',
        expected_signal: 'At least one concrete reply or permission boundary',
        cost_level: 'low',
        boundary_level: 'safe',
        why_different: 'Switches from broad search to buyer-specific outreach',
        status,
      }),
    });
    return ((await res.json()) as { data: { id: string } }).data.id;
  }

  it('gets and patches an experiment', async () => {
    const id = await createExperiment();

    const getRes = await app.request(`/api/v1/experiments/${id}`);
    expect(getRes.status).toBe(200);
    expect(((await getRes.json()) as { data: { id: string } }).data.id).toBe(id);

    const patchRes = await app.request(`/api/v1/experiments/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'blocked',
        boundary_level: 'permission_required',
        expected_signal: 'User grants permission',
      }),
    });

    expect(patchRes.status).toBe(200);
    const patchBody = await patchRes.json() as {
      data: { status: string; boundary_level: string; expected_signal: string };
    };
    expect(patchBody.data).toEqual(expect.objectContaining({
      status: 'blocked',
      boundary_level: 'permission_required',
      expected_signal: 'User grants permission',
    }));
  });

  it('returns 409 instead of 500 when patching would create a second active experiment', async () => {
    await createExperiment('active');
    const plannedId = await createExperiment('planned');

    const patchRes = await app.request(`/api/v1/experiments/${plannedId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    });

    expect(patchRes.status).toBe(409);
    const body = await patchRes.json() as { error: { code: string; message: string } };
    expect(body.error).toEqual({
      code: 'active_experiment_conflict',
      message: 'An active experiment already exists for this goal',
    });
  });
});
