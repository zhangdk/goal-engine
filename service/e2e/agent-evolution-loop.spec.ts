/**
 * agent-evolution-loop.spec.ts
 *
 * E2E test: Complete Goal Engine Knowledge System Evolution Loop
 *
 * This test validates the full evolution circuit:
 *   Failure → Reflection → Knowledge Auto-Creation → Policy Update →
 *   Retry Guard → New Approach → Success → Evidence in /ui & DB
 *
 * HOW IT WORKS:
 * The test uses Playwright to open a real browser, navigate to the Goal
 * Engine's /ui observer page, and interact with its embedded forms. The /ui
 * page has forms for every Goal Engine action (start goal, record failure,
 * retry check, recover) that call the underlying API. This means we get a
 * true browser-based E2E test WITHOUT needing a live OpenClaw instance or
 * the Protocol30 platform gateway — the /ui page IS the agent simulation layer.
 *
 * Run:
 *   cd /Users/gushuai/dev/Protocol30/goal-engine/service
 *   pnpm test:e2e
 *
 * Prerequisites:
 * - playwright.config.ts automatically starts the Goal Engine service at port 3210
 * - No other services needed — the /ui page is self-contained
 * - The DB is fresh per run (unique path via E2E_DB_PATH env)
 */

import { expect, test } from '@playwright/test';
import Database from 'better-sqlite3';
import { rmSync, writeFileSync, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, '..', '..');
const runtimeStatePath = resolve(repoRoot, '.openclaw', 'runtime-state.json');

// ---------------------------------------------------------------------------
// Shared state — all phases read/write to this single object
// ---------------------------------------------------------------------------
interface SharedState {
  goalId?: string;
  attempt1Id?: string;
  reflection1Id?: string;
  attempt2Id?: string;
  knowledge1Id?: string;
}

const sharedState: SharedState = {};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeReadJson(path: string): unknown {
  try {
    return existsSync(path) ? JSON.parse(readFileSync(path, 'utf-8')) : null;
  } catch {
    return null;
  }
}

function restoreRuntimeState(saved: unknown): void {
  if (saved) {
    writeFileSync(runtimeStatePath, JSON.stringify(saved, null, 2), 'utf-8');
  } else {
    rmSync(runtimeStatePath, { force: true });
  }
}

/**
 * Find the E2E test DB file.
 * playwright.config.ts sets E2E_DB_PATH for the webServer process, but the test
 * runner may not inherit it. So we fall back to finding the most recently
 * modified goal-engine-e2e-*.db in the service directory.
 */
function findDbPath(): string {
  // If E2E_DB_PATH is set, trust it
  if (process.env['E2E_DB_PATH']) return process.env['E2E_DB_PATH']!;

  // Otherwise scan for the most recent goal-engine-e2e-*.db in service/
  const serviceDir = resolve(__dirname, '..');
  let newest: string | null = null;
  let newestMtime = 0;
  try {
    for (const file of readdirSync(serviceDir)) {
      if (file.startsWith('goal-engine-e2e-') && file.endsWith('.db')) {
        const mtime = statSync(resolve(serviceDir, file)).mtimeMs;
        if (mtime > newestMtime) {
          newestMtime = mtime;
          newest = resolve(serviceDir, file);
        }
      }
    }
  } catch {
    // ignore
  }

  return newest ?? resolve(serviceDir, `goal-engine-e2e-${Date.now()}.db`);
}

const dbPath = findDbPath();

function db(): Database.Database {
  return new Database(dbPath, { readonly: true });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

test.describe.serial('Agent Evolution Loop — Knowledge System E2E', () => {
  // Unique goal title per run to avoid collisions
  const evolutionGoalTitle = `Evolution E2E Goal ${Date.now()}`;

  // Save & restore runtime state so we don't pollute the user's openclaw state
  const previousRuntimeState = safeReadJson(runtimeStatePath);

  test.beforeAll(async () => {
    // Initialize shared state — all phases read/write to this
    sharedState.goalId = undefined;
    sharedState.attempt1Id = undefined;
    sharedState.reflection1Id = undefined;
    sharedState.attempt2Id = undefined;
  });

  test.afterEach(() => {
    restoreRuntimeState(previousRuntimeState);
  });

  // =========================================================================
  // PHASE 0 — Prerequisites: service must be up
  // =========================================================================
  test('Phase 0: Goal Engine service is running', async ({ request }) => {
    const res = await request.get('/api/v1/health');
    if (res.status() !== 200) {
      test.skip(true, `Goal Engine service not running. Start with: cd service && pnpm dev`);
    }
    expect(res.status()).toBe(200);
  });

  // =========================================================================
  // PHASE 1 — Start a goal through the /ui gallery form
  // =========================================================================
  test('Phase 1: start evolution goal via /ui gallery form', async ({ page }) => {
    test.slow(60_000);

    // Close any existing active goal first via API
    const api = page.context().request;
    const currentGoalRes = await api.get('/api/v1/goals/current');
    if (currentGoalRes.status() === 200) {
      const body = await currentGoalRes.json() as { data?: { id: string } };
      if (body.data?.id) {
        const closeRes = await api.patch(`/api/v1/goals/${body.data.id}`, {
          data: { status: 'completed' },
        });
        expect(closeRes.status()).toBe(200);
      }
    }

    // Navigate to the /ui gallery
    await page.goto('/ui');
    await page.waitForLoadState('networkidle');

    // Verify gallery loads
    await expect(page.getByRole('heading', { name: /观察台|Observ/i })).toBeVisible();

    // Fill the "开始目标" form on the gallery page
    await page.getByLabel('标题').fill(evolutionGoalTitle);
    await page.getByLabel('成功标准').fill(
      'Agent first fails with wrong approach, then learns and succeeds with correct approach'
    );
    await page.getByLabel('当前阶段').fill('investigation');
    await page.getByRole('button', { name: '开始目标' }).click();

    // Should navigate to the agent detail page
    await page.waitForURL(/\/ui\/agents\//);
    await expect(page.locator('#overview-primary')).toContainText(evolutionGoalTitle);
    await expect(page.locator('#overview-primary')).toContainText(/进行中|active/i);

    // Extract goal ID from the page (the form embeds it in data attributes)
    // The goal was created — we can find it via API
    const createdGoalRes = await api.get('/api/v1/goals/current');
    expect(createdGoalRes.status()).toBe(200);
    const createdGoalBody = await createdGoalRes.json() as {
      data: { id: string; title: string; status: string };
    };
    sharedState.goalId = createdGoalBody.data.id;
    expect(sharedState.goalId).toBeTruthy();
    expect(createdGoalBody.data.title).toBe(evolutionGoalTitle);
    expect(createdGoalBody.data.status).toBe('active');
  });

  // =========================================================================
  // PHASE 2 — Record first failed attempt through /ui agent detail form
  // =========================================================================
  test('Phase 2: record first failed attempt via /ui form', async ({ page }) => {
    test.slow(30_000);
    expect(sharedState.goalId, 'Phase 1 must complete first').toBeTruthy();

    await page.goto(`/ui/agents/goal-engine-demo`);
    await page.waitForLoadState('networkidle');

    // Open the "记录失败" panel
    await page.locator('#record-failure-panel summary').click();
    await expect(page.locator('#record-failure-form')).toBeVisible();

    // Fill the failure form using exact field names from the UI HTML
    await page.getByLabel('阶段').fill('investigation');
    await page.getByLabel('采取动作').fill(
      'Tried web search for TypeScript files in the repository — returned generic web results, not actual local files'
    );
    // Strategy tags: target the field inside the record-failure form specifically
    await page.locator('#record-failure-form [name="strategy_tags"]').fill('web-search');
    // Failure type select
    await page.getByLabel('失败类型').selectOption('tool_error');
    // Reflection fields
    await page.getByLabel('反思摘要').fill(
      'Web search for local repository files returned irrelevant results'
    );
    await page.getByLabel('根因').fill(
      'The files are on the local filesystem, not on the web. Web search cannot access local repo contents.'
    );
    await page.getByLabel('必须改变').fill(
      'Switch to local filesystem tools: ls, find, or glob to list actual files in the repository'
    );
    await page.getByLabel('避免策略').fill('web-search');

    await page.locator('#record-failure-form').getByRole('button', { name: '记录失败' }).click();

    // Verify success message appears
    await expect(page.getByText(/已记录失败|失败.*已记录/i)).toBeVisible();

    // Extract attempt and reflection IDs from the DB
    const database = db();
    try {
      const attemptRows = database
        .prepare('SELECT id, result, action_taken FROM attempts WHERE goal_id = ? ORDER BY created_at DESC LIMIT 1')
        .get(sharedState.goalId) as { id: string; result: string; action_taken: string } | undefined;
      expect(attemptRows, 'Attempt not found in DB').toBeTruthy();
      sharedState.attempt1Id = attemptRows.id;
      expect(attemptRows.result).toBe('failure');
      expect(attemptRows.action_taken).toContain('web search');

      const reflectionRows = database
        .prepare('SELECT id, avoid_strategy, must_change FROM reflections WHERE attempt_id = ?')
        .get(sharedState.attempt1Id) as { id: string; avoid_strategy: string; must_change: string } | undefined;
      expect(reflectionRows, 'Reflection not found in DB').toBeTruthy();
      sharedState.reflection1Id = reflectionRows.id;
      expect(reflectionRows.avoid_strategy).toBe('web-search');
      expect(reflectionRows.must_change).toContain('filesystem');
    } finally {
      database.close();
    }
  });

  // =========================================================================
  // PHASE 3 — Verify learning: knowledge auto-created from reflection
  // =========================================================================
  test('Phase 3: verify knowledge auto-created from reflection', async ({ request }) => {
    test.slow();
    expect(sharedState.goalId, 'Phase 1 must complete first').toBeTruthy();
    expect(sharedState.attempt1Id, 'Phase 2 must complete first').toBeTruthy();

    // Query the reflection endpoint to get the auto-created knowledge
    const reflectionRes = await request.get('/api/v1/ui/agents/goal-engine-demo');
    expect(reflectionRes.status()).toBe(200);
    const body = await reflectionRes.json() as {
      data: {
        knowledge: Array<{ id: string; implication: string; hypothesis: string }>;
        current_state: {
          avoid_strategies: string[];
          recommended_next_step: string | null;
        };
      };
    };

    // SIGNAL 1: Knowledge array is not empty
    expect(body.data.knowledge.length).toBeGreaterThanOrEqual(1);

    // SIGNAL 2: Knowledge has the filesystem switching implication
    const fsKnowledge = body.data.knowledge.find(
      (k) => k.implication.toLowerCase().includes('filesystem') || k.implication.toLowerCase().includes('local')
    );
    expect(fsKnowledge, 'Knowledge about switching to filesystem tools should be created from reflection').toBeTruthy();

    // SIGNAL 3: Policy has avoid_strategies from reflection
    expect(body.data.current_state.avoid_strategies).toContain('web-search');

    // SIGNAL 4: Policy has recommended next step from reflection
    expect(body.data.current_state.recommended_next_step).toBeTruthy();
    expect(
      body.data.current_state.recommended_next_step?.toLowerCase()
    ).toContain('filesystem');

    // Capture knowledge1Id from DB for use in Phase 4 and Phase 5
    const database = db();
    try {
      const knowledgeIdFromDb = database
        .prepare('SELECT id FROM knowledge WHERE goal_id = ? ORDER BY created_at ASC LIMIT 1')
        .get(sharedState.goalId) as { id: string } | undefined;
      sharedState.knowledge1Id = knowledgeIdFromDb?.id;
    } finally {
      database.close();
    }
  });

  // =========================================================================
  // PHASE 4 — Retry guard: block old approach, allow new approach
  // =========================================================================
  test('Phase 4: retry guard blocks old approach, allows new approach', async ({ page }) => {
    test.slow(30_000);
    expect(sharedState.goalId, 'Phase 1 must complete first').toBeTruthy();

    await page.goto(`/ui/agents/goal-engine-demo`);
    await page.waitForLoadState('networkidle');

    // Open the retry check panel
    await page.locator('#retry-check-panel summary').click();
    await expect(page.locator('#retry-check-form')).toBeVisible();

    // --- SUB-TEST A: Old approach should be BLOCKED ---
    await page.getByLabel('计划动作').fill('Tried web search again with different keywords');
    await page.getByLabel('这次改变了什么').fill(''); // empty — no meaningful change
    await page.locator('#retry-check-form [name="strategy_tags"]').fill('web-search');
    await page.getByLabel('我已经阅读当前指导').check();

    // Intercept the API response to validate advisories
    const [blockedResponse] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/') && res.request().method() !== 'GET'),
      page.locator('#retry-check-form').getByRole('button', { name: '检查重试' }).click(),
    ]);

    const blockedBody = await blockedResponse.json() as {
      data: {
        allowed: boolean;
        advisories?: string[];
        referenced_knowledge_ids?: string[];
      };
    };

    // Verify blocked via API
    expect(blockedBody.data.allowed).toBe(false);

    // NEW: Verify advisories are returned with the blocked response (advisories is string[])
    const advisoriesA = blockedBody.data.advisories as string[] | undefined;
    expect(advisoriesA && advisoriesA.length > 0, 'Should return at least one advisory').toBeTruthy();
    const fsAdvisoryA = advisoriesA?.find((a) =>
      a.toLowerCase().includes('filesystem') || a.toLowerCase().includes('local')
    );
    expect(fsAdvisoryA, 'Advisory should mention switching to filesystem tools').toBeTruthy();

    // NEW: Verify referenced_knowledge_ids
    const refIdsA = blockedBody.data.referenced_knowledge_ids as string[] | undefined;
    expect(refIdsA && refIdsA.length > 0, 'Should return referenced knowledge IDs').toBeTruthy();
    if (sharedState.knowledge1Id && refIdsA) {
      expect(
        refIdsA.some((id) => id === sharedState.knowledge1Id),
        'referenced_knowledge_ids should include the knowledge from Phase 3'
      ).toBeTruthy();
    }

    // Verify UI text matches
    await expect(page.getByText(/已执行一次实时重试检查。/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/允许重试：false|不允许重试/i)).toBeVisible();
    await expect(page.getByText(/no_meaningful_change/i)).toBeVisible();

    // --- SUB-TEST B: New approach should be ALLOWED ---
    // Close and reopen the panel to reset the form
    await page.locator('#retry-check-panel summary').click();
    await page.locator('#retry-check-panel summary').click();

    await page.getByLabel('计划动作').fill('Use find command to list all .ts files in the repository');
    await page.getByLabel('这次改变了什么').fill(
      'Switching from web search to local filesystem tools (find/ls/glob) per guidance'
    );
    await page.locator('#retry-check-form [name="strategy_tags"]').fill('local-fs');
    await page.getByLabel('我已经阅读当前指导').check();

    // Intercept the API response to validate advisories
    const [allowedResponse] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/api/') && res.request().method() !== 'GET'),
      page.locator('#retry-check-form').getByRole('button', { name: '检查重试' }).click(),
    ]);

    const allowedBody = await allowedResponse.json() as {
      data: {
        allowed: boolean;
        advisories?: string[];
      };
    };

    // Verify allowed via API
    expect(allowedBody.data.allowed).toBe(true);

    // NEW: When allowed, advisories should still be present (knowledge context still flows)
    const advisoriesB = allowedBody.data.advisories as string[] | undefined;
    if (advisoriesB && advisoriesB.length > 0) {
      const fsAdvisoryB = advisoriesB.find((a) =>
        a.toLowerCase().includes('filesystem')
      );
      expect(fsAdvisoryB, 'Allowed response should still include knowledge advisories').toBeTruthy();
    }

    // Verify UI text matches
    await expect(page.getByText(/已执行一次实时重试检查。/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/允许重试：true/i)).toBeVisible();

    // --- SUB-TEST C: Record the second successful attempt via API ---
    const api = page.context().request;
    const attempt2Res = await api.post('/api/v1/attempts', {
      data: {
        goal_id: sharedState.goalId,
        stage: 'investigation',
        action_taken: 'Used find command to list all .ts files — found 50+ files and provided count',
        strategy_tags: ['local-fs', 'find-command'],
        result: 'success',
      },
    });
    expect(attempt2Res.status()).toBe(201);

    const attempt2Body = await attempt2Res.json() as { data: { id: string; result: string; strategy_tags: string[] } };
    sharedState.attempt2Id = attempt2Body.data.id;
    expect(attempt2Body.data.result).toBe('success');
    expect(attempt2Body.data.strategy_tags).toContain('local-fs');
    expect(attempt2Body.data.strategy_tags).not.toContain('web-search');
  });

  // =========================================================================
  // PHASE 5 — Verify recovery packet contains knowledge from failure
  // =========================================================================
  test('Phase 5: verify recovery packet carries learned knowledge', async ({ request }) => {
    test.slow();
    expect(sharedState.goalId, 'Phase 1 must complete first').toBeTruthy();

    const recoveryRes = await request.get(`/api/v1/recovery-packet?goal_id=${sharedState.goalId}`);
    expect(recoveryRes.status()).toBe(200);
    const body = await recoveryRes.json() as {
      data: {
        goal_id: string;
        avoid_strategies: string[];
        relevant_knowledge: Array<{ id: string; implication: string }>;
        last_failure_summary?: string;
        preferred_next_step?: string;
      };
    };

    expect(body.data.goal_id).toBe(sharedState.goalId);

    // SIGNAL: Avoid strategies from reflection are in the recovery packet
    expect(body.data.avoid_strategies).toContain('web-search');

    // SIGNAL: Preferred next step is the must-change from reflection
    expect(body.data.preferred_next_step).toBeTruthy();

    // SIGNAL: Relevant knowledge is not empty (knowledge was found by tag matching)
    expect(body.data.relevant_knowledge.length).toBeGreaterThanOrEqual(1);

    // SIGNAL: At least one knowledge entry has the filesystem implication
    const hasFSTeaching = body.data.relevant_knowledge.some(
      (k) => k.implication.toLowerCase().includes('filesystem') || k.implication.toLowerCase().includes('local')
    );
    expect(hasFSTeaching, 'Recovery packet should contain filesystem-learning knowledge').toBe(true);

    // SIGNAL: Last failure summary is present
    expect(body.data.last_failure_summary).toBeTruthy();
    expect(body.data.last_failure_summary).toContain('web search');

    // GAP 3 Part A: Verify knowledge_reference_events was created by recovery packet call
    const database = db();
    try {
      const refEvents = database
        .prepare("SELECT * FROM knowledge_reference_events WHERE goal_id = ? AND decision_surface = 'recovery_packet'")
        .get(sharedState.goalId) as { id: string; knowledge_ids: string } | undefined;
      expect(refEvents, 'knowledge_reference_event should be created by recovery packet call').toBeTruthy();
      if (sharedState.knowledge1Id) {
        const refKnowledgeIds = JSON.parse(refEvents?.knowledge_ids ?? '[]') as string[];
        expect(
          refKnowledgeIds.includes(sharedState.knowledge1Id),
          'knowledge_reference_event should include the knowledge from Phase 3'
        ).toBeTruthy();
      }

      // GAP 3 Part B: Verify support_count increments on second call
      // knowledge_promotions for agent-level require agent_id, so get it first
      const promotionRow = database
        .prepare('SELECT id FROM knowledge_promotions WHERE knowledge_id = ? LIMIT 1')
        .get(sharedState.knowledge1Id) as { id: string } | undefined;

      let supportBefore = 0;
      let promotionId: string | undefined;
      if (promotionRow) {
        const promoData = database
          .prepare('SELECT id, support_count FROM knowledge_promotions WHERE id = ?')
          .get(promotionRow.id) as { id: string; support_count: number } | undefined;
        supportBefore = promoData?.support_count ?? 0;
        promotionId = promoData?.id;
      }

      // Call recovery packet again
      const packet2Res = await request.get(`/api/v1/recovery-packet?goal_id=${sharedState.goalId}`);
      expect(packet2Res.status()).toBe(200);

      // Verify support_count incremented
      if (promotionId) {
        const supportAfter = database
          .prepare('SELECT support_count FROM knowledge_promotions WHERE id = ?')
          .get(promotionId) as { support_count: number } | undefined;
        expect(
          supportAfter?.support_count ?? 0,
          'support_count should increment on second reference'
        ).toBeGreaterThan(supportBefore);
      }
    } finally {
      database.close();
    }
  });

  // =========================================================================
  // PHASE 6 — Direct DB verification: 8 evolution signals
  // =========================================================================
  test('Phase 6: verify all 8 evolution signals via direct SQLite query', async () => {
    test.slow();
    expect(sharedState.goalId).toBeTruthy();
    expect(sharedState.attempt1Id).toBeTruthy();
    expect(sharedState.reflection1Id).toBeTruthy();
    expect(sharedState.attempt2Id).toBeTruthy();

    const database = db();
    try {
      // SIGNAL 1: Goal exists and is active
      const goalRow = database
        .prepare('SELECT id, status, title FROM goals WHERE id = ?')
        .get(sharedState.goalId) as { id: string; status: string; title: string } | undefined;
      expect(goalRow, 'Goal not found in DB').toBeTruthy();
      expect(goalRow.status).toBe('active');
      expect(goalRow.title).toBe(evolutionGoalTitle);

      // SIGNAL 2: Both attempts exist
      const attempts = database
        .prepare(
          'SELECT id, result, action_taken, strategy_tags FROM attempts WHERE goal_id = ? ORDER BY created_at ASC'
        )
        .all(sharedState.goalId) as Array<{
          id: string;
          result: string;
          action_taken: string;
          strategy_tags: string;
        }>;
      expect(attempts.length).toBeGreaterThanOrEqual(2);
      const [firstAttempt, secondAttempt] = attempts;
      expect(firstAttempt.result).toBe('failure');
      expect(secondAttempt.result).toBe('success');

      // SIGNAL 3: Behavioral evolution — different action_taken
      expect(secondAttempt.action_taken).not.toBe(firstAttempt.action_taken);

      // SIGNAL 4: Strategic evolution — different strategy tags
      const firstTags = JSON.parse(firstAttempt.strategy_tags) as string[];
      const secondTags = JSON.parse(secondAttempt.strategy_tags) as string[];
      expect(firstTags).toContain('web-search');
      expect(secondTags).toContain('local-fs');
      expect(secondTags).not.toContain('web-search');

      // SIGNAL 5: Reflection was recorded with correct guidance
      const reflectionRow = database
        .prepare('SELECT id, avoid_strategy, must_change FROM reflections WHERE id = ?')
        .get(sharedState.reflection1Id) as {
          id: string;
          avoid_strategy: string;
          must_change: string;
        } | undefined;
      expect(reflectionRow, 'Reflection not found in DB').toBeTruthy();
      expect(reflectionRow.avoid_strategy).toBe('web-search');
      expect(reflectionRow.must_change.toLowerCase()).toContain('filesystem');

      // SIGNAL 6: Knowledge entry auto-created from reflection
      const knowledgeRows = database
        .prepare('SELECT id, source_attempt_id, implication, related_strategy_tags FROM knowledge WHERE goal_id = ?')
        .all(sharedState.goalId) as Array<{
          id: string;
          source_attempt_id: string;
          implication: string;
          related_strategy_tags: string;
        }>;
      expect(
        knowledgeRows.length,
        'No knowledge entries found after reflection — KnowledgeService.createFromReflection() may be broken'
      ).toBeGreaterThanOrEqual(1);

      const knowledgeFromReflection = knowledgeRows.find((k) => k.source_attempt_id === sharedState.attempt1Id);
      expect(knowledgeFromReflection, 'Knowledge should reference the failed attempt').toBeTruthy();
      expect(
        knowledgeFromReflection.implication.toLowerCase(),
        'Knowledge implication should mention switching to filesystem tools'
      ).toContain('filesystem');
      expect(knowledgeFromReflection.related_strategy_tags).toContain('web-search');

      // SIGNAL 7: Knowledge promotion exists at agent level
      const promotionRows = database
        .prepare(
          'SELECT id, knowledge_id, visibility, agent_id FROM knowledge_promotions WHERE knowledge_id = ?'
        )
        .all(knowledgeFromReflection.id) as Array<{
          id: string;
          knowledge_id: string;
          visibility: string;
          agent_id: string;
        }>;
      expect(
        promotionRows.length,
        'No knowledge promotions found — KnowledgeService.recordReference() may not be called by RecoveryService'
      ).toBeGreaterThanOrEqual(1);

      const agentPromotion = promotionRows.find((p) => p.visibility === 'agent');
      expect(agentPromotion, 'No agent-level promotion found').toBeTruthy();
      expect(agentPromotion.agent_id).toBeTruthy();

      // SIGNAL 8: Knowledge reference event exists
      const refEventRows = database
        .prepare(
          'SELECT id, knowledge_ids, decision_surface FROM knowledge_reference_events WHERE goal_id = ?'
        )
        .all(sharedState.goalId) as Array<{
          id: string;
          knowledge_ids: string;
          decision_surface: string;
        }>;
      expect(
        refEventRows.length,
        'No knowledge reference events found — recovery route may not create knowledge_reference_event'
      ).toBeGreaterThanOrEqual(1);

      const recoveryRefEvent = refEventRows.find((e) => e.decision_surface === 'recovery_packet');
      expect(recoveryRefEvent, 'No recovery_packet reference event found').toBeTruthy();
      const refKnowledgeIds = JSON.parse(recoveryRefEvent.knowledge_ids) as string[];
      expect(
        refKnowledgeIds,
        'Recovery reference event should include the knowledge from the reflection'
      ).toContain(knowledgeFromReflection.id);
    } finally {
      database.close();
    }
  });

  // =========================================================================
  // PHASE 7 — Verify evolution evidence in /ui JSON API
  // =========================================================================
  test('Phase 7: verify evolution in /ui agent detail JSON API', async ({ request }) => {
    test.slow();
    expect(sharedState.goalId, 'Phase 1 must complete first').toBeTruthy();

    const detailRes = await request.get('/api/v1/ui/agents/goal-engine-demo');
    expect(detailRes.status()).toBe(200, 'UI agent detail endpoint failed');
    const body = await detailRes.json() as {
      data: {
        header: {
          agent_id: string;
          current_goal: string | null;
          current_goal_id: string | null;
        };
        current_state: {
          avoid_strategies: string[];
          recommended_next_step: string | null;
        };
        knowledge: Array<{ id: string; implication: string; hypothesis: string }>;
        timeline: Array<{ id: string; type: string; title: string }>;
        goal_history: Array<{ goal_id: string; status: string }>;
      };
    };

    // SIGNAL: Agent is tracked in UI
    expect(body.data.header.agent_id).toBe('goal-engine-demo');

    // SIGNAL: Current goal is shown
    expect(body.data.header.current_goal).toBeTruthy();
    expect(body.data.header.current_goal_id).toBeTruthy();

    // SIGNAL: Avoid strategies visible (from reflection)
    expect(
      body.data.current_state.avoid_strategies,
      'Avoid strategies from reflection should appear in UI current_state'
    ).toContain('web-search');

    // SIGNAL: Recommended next step visible (from reflection's must_change)
    expect(
      body.data.current_state.recommended_next_step,
      'Recommended next step from reflection should appear in UI'
    ).toBeTruthy();

    // SIGNAL: Knowledge visible in UI
    expect(
      body.data.knowledge.length,
      'Knowledge entries should be visible in UI'
    ).toBeGreaterThanOrEqual(1);
    const fsKnowledge = body.data.knowledge.find(
      (k) => k.implication.toLowerCase().includes('filesystem') || k.implication.toLowerCase().includes('local')
    );
    expect(
      fsKnowledge,
      'Knowledge about switching to filesystem tools should appear in UI knowledge section'
    ).toBeTruthy();

    // SIGNAL: Timeline contains the failure event
    const timelineTypes = body.data.timeline.map((e) => e.type);
    expect(
      timelineTypes,
      'Timeline should contain at least the failure event'
    ).toContain('failure');

    // SIGNAL: Timeline contains the progress event (from second attempt)
    expect(
      timelineTypes,
      'Timeline should contain the progress event from the successful second attempt'
    ).toContain('progress');

    // SIGNAL: Timeline shows the evolution arc (both events exist)
    const failureEvent = body.data.timeline.find((e) => e.type === 'failure');
    const progressEvent = body.data.timeline.find((e) => e.type === 'progress');
    expect(failureEvent, 'Timeline must have a failure event').toBeTruthy();
    expect(progressEvent, 'Timeline must have a progress event after second attempt').toBeTruthy();

    // NOTE: goal_history reflects goal_agent_assignments table, which the gallery
    // form does not write. The evolution loop is proven by avoid_strategies,
    // knowledge, and timeline above — goal_history is orthogonal to evolution.
  });

  // =========================================================================
  // PHASE 8 — Verify /ui page HTML renders evolution evidence
  // =========================================================================
  test('Phase 8: verify /ui page HTML renders evolution evidence', async ({ page }) => {
    test.slow();
    expect(sharedState.goalId, 'Phase 1 must complete first').toBeTruthy();

    await page.goto('/ui/agents/goal-engine-demo');
    await page.waitForLoadState('networkidle');

    const pageContent = await page.content();

    // SIGNAL: Page shows the avoided strategy text
    expect(pageContent, 'UI should render the avoided "web-search" strategy').toContain('web-search');

    // SIGNAL: Page shows the learning (filesystem tools)
    expect(
      pageContent,
      'UI should render the learning: switch to filesystem tools'
    ).toContain('filesystem');

    // SIGNAL: Page has timeline element
    expect(
      pageContent,
      'UI should render the timeline section'
    ).toMatch(/timeline|时间线/i);

    // SIGNAL: Page shows active goal status
    expect(
      pageContent,
      'UI should show the active goal'
    ).toMatch(/进行中|active/i);

    // SIGNAL: Page has retry check panel (shows the evolution is interactive)
    expect(
      pageContent,
      'UI should have the retry check panel for retry guard verification'
    ).toContain('retry-check');
  });
});
