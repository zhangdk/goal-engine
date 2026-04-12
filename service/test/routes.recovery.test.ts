import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { makeTestDb } from './helpers.js';
import { createApp } from '../src/app.js';
import { KnowledgeReferenceEventRepo } from '../src/repos/knowledge-reference-event.repo.js';

let app: ReturnType<typeof createApp>;
let goalId: string;
let db: Database.Database;

beforeEach(async () => {
  db = makeTestDb();
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
        current_policy?: {
          preferred_next_step?: string;
          must_check_before_retry: string[];
        };
        recent_attempts: unknown[];
        relevant_knowledge: unknown[];
        shared_wisdom: unknown[];
        open_questions: string[];
        generated_at: string;
      };
    };
    expect(body.data.goal_id).toBe(goalId);
    expect(body.data.goal_title).toBe('恢复测试目标');
    expect(body.data.current_stage).toBe('research');
    expect(body.data.success_criteria).toEqual(['条件A']);
    expect(body.data.avoid_strategies).toEqual([]);
    expect(body.data.recent_attempts).toEqual([]);
    expect(body.data.relevant_knowledge).toEqual([]);
    expect(body.data.shared_wisdom).toEqual([]);
    expect(body.data.open_questions.length).toBeGreaterThan(0);
    expect(body.data.generated_at).toBeDefined();
  });

  it('returns cognitive recovery packet fields after reflection-derived knowledge exists', async () => {
    const goalRes = await app.request('/api/v1/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: '认知恢复目标',
        success_criteria: ['条件A'],
        stop_conditions: [],
        current_stage: 'search',
      }),
    });
    goalId = ((await goalRes.json()) as { data: { id: string } }).data.id;

    const attemptRes = await app.request('/api/v1/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: goalId,
        stage: 'search',
        action_taken: 'Used broad aggregator search',
        strategy_tags: ['event_search'],
        result: 'failure',
        failure_type: 'tool_error',
      }),
    });
    const attemptId = ((await attemptRes.json()) as { data: { id: string } }).data.id;

    await app.request('/api/v1/reflections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        goal_id: goalId,
        attempt_id: attemptId,
        summary: 'Aggregator result was stale.',
        root_cause: 'Third-party pages lag organizer pages.',
        must_change: 'Check official organizer pages.',
        avoid_strategy: 'event_search',
      }),
    });

    const res = await app.request(`/api/v1/recovery-packet?goal_id=${goalId}`);
    expect(res.status).toBe(200);
    const body = await res.json() as {
      data: {
        current_policy: { preferred_next_step: string };
        recent_attempts: Array<{ action_taken: string }>;
        relevant_knowledge: Array<{ observation: string; implication: string }>;
        shared_wisdom: unknown[];
        open_questions: string[];
      };
    };

    expect(body.data.current_policy.preferred_next_step).toBe('Check official organizer pages.');
    expect(body.data.recent_attempts[0].action_taken).toBe('Used broad aggregator search');
    expect(body.data.relevant_knowledge[0]).toEqual(
      expect.objectContaining({
        observation: 'Aggregator result was stale.',
        implication: 'Check official organizer pages.',
      })
    );
    expect(body.data.shared_wisdom).toEqual([]);
    expect(body.data.open_questions.length).toBeGreaterThan(0);

    const referenceRepo = new KnowledgeReferenceEventRepo(db);
    expect(referenceRepo.listByGoal('goal-engine-demo', goalId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          decisionSurface: 'recovery_packet',
          knowledgeIds: expect.any(Array),
        }),
      ])
    );
  });

  it('does not recover another agent goal by id', async () => {
    const goalRes = await app.request('/api/v1/goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Agent-Id': 'agent-a' },
      body: JSON.stringify({
        title: 'Agent A Recovery Goal',
        success_criteria: ['A succeeds'],
        stop_conditions: [],
        current_stage: 'research',
      }),
    });
    const agentAGoalId = ((await goalRes.json()) as { data: { id: string } }).data.id;

    const res = await app.request(`/api/v1/recovery-packet?goal_id=${agentAGoalId}`, {
      headers: { 'X-Agent-Id': 'agent-b' },
    });

    expect(res.status).toBe(404);
    const body = await res.json() as { error: { code: string } };
    expect(body.error.code).toBe('not_found');
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
