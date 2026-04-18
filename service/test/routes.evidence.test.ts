import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb } from './helpers.js';
import { createApp } from '../src/app.js';

let app: ReturnType<typeof createApp>;
let goalId: string;
let attemptId: string;

beforeEach(async () => {
  const db = makeTestDb();
  app = createApp(db);

  const goalRes = await app.request('/api/v1/goals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Agent-Id': 'agent-evidence' },
    body: JSON.stringify({
      title: 'Evidence goal',
      success_criteria: ['Evidence exists'],
      stop_conditions: [],
      current_stage: 'research',
    }),
  });
  goalId = ((await goalRes.json()) as { data: { id: string } }).data.id;

  const attemptRes = await app.request('/api/v1/attempts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Agent-Id': 'agent-evidence' },
    body: JSON.stringify({
      goal_id: goalId,
      stage: 'research',
      action_taken: 'Created artifact',
      strategy_tags: ['artifact'],
      result: 'partial',
    }),
  });
  attemptId = ((await attemptRes.json()) as { data: { id: string } }).data.id;
});

describe('POST /api/v1/evidence', () => {
  it('records evidence for a goal and attempt', async () => {
    const res = await app.request('/api/v1/evidence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Agent-Id': 'agent-evidence' },
      body: JSON.stringify({
        goal_id: goalId,
        attempt_id: attemptId,
        kind: 'artifact',
        summary: 'Created landing page draft',
        file_path: 'artifacts/landing.md',
        observed_at: '2026-04-17T00:00:00.000Z',
        verifier: 'agent',
        confidence: 0.8,
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json() as { data: { id: string; file_path: string; kind: string } };
    expect(body.data.id).toBeDefined();
    expect(body.data.kind).toBe('artifact');
    expect(body.data.file_path).toBe('artifacts/landing.md');
  });

  it('rejects evidence for another agent goal', async () => {
    const res = await app.request('/api/v1/evidence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Agent-Id': 'other-agent' },
      body: JSON.stringify({
        goal_id: goalId,
        kind: 'artifact',
        summary: 'Should not attach',
        observed_at: '2026-04-17T00:00:00.000Z',
        verifier: 'agent',
        confidence: 0.8,
      }),
    });

    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/evidence', () => {
  it('lists evidence for a goal', async () => {
    await app.request('/api/v1/evidence', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Agent-Id': 'agent-evidence' },
      body: JSON.stringify({
        goal_id: goalId,
        attempt_id: attemptId,
        kind: 'artifact',
        summary: 'Created landing page draft',
        observed_at: '2026-04-17T00:00:00.000Z',
        verifier: 'agent',
        confidence: 0.8,
      }),
    });

    const res = await app.request(`/api/v1/evidence?goal_id=${goalId}`, {
      headers: { 'X-Agent-Id': 'agent-evidence' },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as { data: unknown[] };
    expect(body.data).toHaveLength(1);
  });
});
