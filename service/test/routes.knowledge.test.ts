import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { makeTestDb } from './helpers.js';

let app: ReturnType<typeof createApp>;

beforeEach(() => {
  app = createApp(makeTestDb());
});

async function createGoal(agentId: string) {
  const res = await app.request('/api/v1/goals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Agent-Id': agentId },
    body: JSON.stringify({
      title: `${agentId} goal`,
      success_criteria: ['succeed'],
      stop_conditions: [],
      current_stage: 'search',
    }),
  });
  expect(res.status).toBe(201);
  return ((await res.json()) as { data: { id: string } }).data.id;
}

describe('knowledge routes', () => {
  it('creates and lists knowledge for the caller agent only', async () => {
    const goalId = await createGoal('agent-a');

    const createRes = await app.request('/api/v1/knowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Agent-Id': 'agent-a' },
      body: JSON.stringify({
        goal_id: goalId,
        context: 'search stage',
        observation: 'aggregator failed',
        hypothesis: 'stale index',
        implication: 'check official sources',
        related_strategy_tags: ['event_search'],
      }),
    });
    expect(createRes.status).toBe(201);

    const agentAList = await app.request(`/api/v1/knowledge?goal_id=${goalId}`, {
      headers: { 'X-Agent-Id': 'agent-a' },
    });
    expect(agentAList.status).toBe(200);
    expect(((await agentAList.json()) as { data: unknown[] }).data).toHaveLength(1);

    const agentBList = await app.request(`/api/v1/knowledge?goal_id=${goalId}`, {
      headers: { 'X-Agent-Id': 'agent-b' },
    });
    expect(agentBList.status).toBe(404);
  });

  it('promotes knowledge to agent visibility and exposes it as shared wisdom to the same agent', async () => {
    const goalId = await createGoal('agent-a');
    const createRes = await app.request('/api/v1/knowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Agent-Id': 'agent-a' },
      body: JSON.stringify({
        goal_id: goalId,
        context: 'search stage',
        observation: 'aggregator failed',
        hypothesis: 'stale index',
        implication: 'check official sources',
        related_strategy_tags: ['event_search'],
      }),
    });
    const knowledgeId = ((await createRes.json()) as { data: { id: string } }).data.id;

    const promoteRes = await app.request(`/api/v1/knowledge/${knowledgeId}/promotions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Agent-Id': 'agent-a' },
      body: JSON.stringify({
        visibility: 'agent',
        subject: 'event_search',
        condition: { stage: 'search' },
        summary: 'Aggregators can be stale.',
        recommendation: 'Check official organizer pages.',
        confidence: 0.75,
      }),
    });
    expect(promoteRes.status).toBe(201);

    const wisdomRes = await app.request('/api/v1/knowledge/shared?subjects=event_search', {
      headers: { 'X-Agent-Id': 'agent-a' },
    });
    expect(wisdomRes.status).toBe(200);
    expect(((await wisdomRes.json()) as { data: Array<{ subject: string }> }).data[0].subject).toBe('event_search');
  });
});
