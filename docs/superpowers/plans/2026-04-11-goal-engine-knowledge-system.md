# Goal Engine Knowledge System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement Level 2 and Level 3 from `docs/isolation-and-knowledge-design.md`: scoped knowledge sharing, descriptive cognition, Recovery Packet knowledge injection, and Retry Guard guidance without hard-blocking repeated strategies.

**Architecture:** Keep Level 1 agent isolation as the trust boundary, then add `knowledge` as goal-scoped descriptive facts and `knowledge_promotions` as sanitized private/agent/global shared wisdom. Reflection writes become the ingestion point for knowledge, Recovery Packet becomes the read/injection surface, and Retry Guard stops blocking on `avoid_strategies` while still recording risk signals for observability.

**Tech Stack:** TypeScript, Hono, better-sqlite3, SQLite JSON strings, Vitest, Playwright, existing Goal Engine service/agent-adapter patterns.

---

## Spec References

- Primary spec: `docs/isolation-and-knowledge-design.md`
- Current Level 1 implementation plan: `docs/superpowers/plans/2026-04-11-agent-isolation-foundation.md`
- Current schema: `service/src/db/schema.sql`
- Current shared contracts: `shared/types.ts`
- Current Recovery Packet assembly: `service/src/services/recovery.service.ts`
- Current Retry Guard behavior: `service/src/services/retry-guard.service.ts`

## Scope Boundaries

This plan implements the full Level 2/3 cognitive system needed by the design doc, but does not remove legacy fields yet.

- Keep `reflections.avoid_strategy` and `policies.avoid_strategies` for compatibility.
- Mark `avoidStrategies` as deprecated in types and response comments where practical.
- Do not implement workspace-level multi-tenancy; `workspace_id` remains future work.
- Do not implement human review UI for global promotion; this plan adds service-level promotion primitives and tests.
- Do not depend on an LLM for knowledge extraction. Use explicit API fields plus deterministic fallback generation from reflection.

## Current Gaps To Close

- No `knowledge` table or repo exists.
- No `knowledge_promotions` table or repo exists.
- No `/api/v1/knowledge` route exists.
- `RecoveryPacket` still returns `avoidStrategies`, not `relevantKnowledge` or `sharedWisdom`.
- `RetryGuardService` still hard-blocks when tags overlap `avoidStrategies`.
- Legacy SQLite migration currently adds `agent_id` columns but does not recreate tables to add composite foreign keys.
- Invalid `X-Agent-Id` currently throws through Hono as a 500 instead of a stable validation error.

## File Map

- Modify: `shared/runtime.js`
  - Remove or deprecate `blocked_strategy_overlap` as an active blocking reason only if tests can be migrated cleanly; keep the literal for historical events.
  - Add guidance-oriented retry reason or warning constants only if needed.
- Modify: `shared/runtime.d.ts`
  - Keep declarations aligned with `shared/runtime.js`.
- Modify: `shared/types.ts`
  - Add `Knowledge`, `KnowledgePromotion`, `KnowledgeVisibility`, and `KnowledgeReferenceEvent`.
  - Extend `RecoveryPacket` with `recentAttempts`, `currentPolicy`, `relevantKnowledge`, `sharedWisdom`, and `openQuestions`.
  - Extend `RetryGuardResult` with `knowledgeContext`, `advisories`, and `referencedKnowledgeIds`.
- Modify: `service/src/db/schema.sql`
  - Add `knowledge`, `knowledge_promotions`, and optional `knowledge_reference_events`.
  - Add indexes from the design doc.
  - Keep existing `avoid_strategies` columns during transition.
- Modify: `service/src/db/client.ts`
  - Add migration for new tables.
  - Harden legacy table recreation for composite FK on core tables.
- Create: `service/src/repos/knowledge.repo.ts`
  - Own CRUD/listing for goal-scoped knowledge.
- Create: `service/src/repos/knowledge-promotion.repo.ts`
  - Own private/agent/global promotion writes and reads.
- Create: `service/src/repos/knowledge-reference-event.repo.ts`
  - Record which knowledge entries were injected into a retry/recovery decision.
- Modify: `service/src/app.ts`
  - Wire new repos/services/routes into the Hono app.
- Create: `service/src/services/knowledge.service.ts`
  - Create descriptive knowledge from explicit payloads or reflection fallback.
  - Read relevant knowledge for one agent/goal.
  - Read shared wisdom by visibility and subject.
  - Promote sanitized knowledge.
- Modify: `service/src/services/policy.service.ts`
  - After writing reflection, create a descriptive knowledge entry.
  - Keep policy update for compatibility but stop treating `avoidStrategy` as the canonical learning output.
- Modify: `service/src/services/recovery.service.ts`
  - Include recent attempts, current policy, relevant knowledge, shared wisdom, and open questions.
- Modify: `service/src/services/retry-guard.service.ts`
  - Change `avoidStrategies` overlap from hard block to advisory.
  - Keep blocks for missing acknowledgement, no meaningful change, and repeated failure without downgrade unless product decides otherwise.
- Create: `service/src/routes/knowledge.ts`
  - Add knowledge create/list/promote endpoints.
- Modify: `service/src/routes/reflections.ts`
  - Return created knowledge alongside reflection and policy.
- Modify: `service/src/routes/recovery.ts`
  - Return cognitive Recovery Packet shape while preserving legacy fields during transition.
- Modify: `service/src/routes/retry-guard.ts`
  - Load relevant knowledge and shared wisdom, pass it to Retry Guard, persist references.
- Modify: `service/src/routes/ui.ts`
  - Display knowledge/advisories in observer UI without making `/ui` the primary interaction surface.
- Modify: `service/src/ui/agent-detail.ts`
  - Add knowledge timeline/evidence items.
- Modify: `agent-adapter/src/tools/recovery-packet-get.ts`
  - Parse new Recovery Packet fields.
- Modify: `agent-adapter/src/tools/reflection-create.ts`
  - Parse optional returned knowledge.
- Create: `agent-adapter/src/tools/knowledge-create.ts`
  - Optional explicit knowledge creation helper.
- Modify: `agent-adapter/src/openclaw/dispatch-entrypoint.ts`
  - Include knowledge context in “show goal status”, “recover current goal”, and retry guidance outputs.
- Test: `service/test/knowledge.repo.test.ts`
- Test: `service/test/knowledge.service.test.ts`
- Test: `service/test/routes.knowledge.test.ts`
- Test: `service/test/routes.reflections-policies.test.ts`
- Test: `service/test/recovery.service.test.ts`
- Test: `service/test/routes.recovery.test.ts`
- Test: `service/test/retry-guard.service.test.ts`
- Test: `service/test/routes.retry-guard.test.ts`
- Test: `service/test/db.client-migration.test.ts`
- Test: `agent-adapter/test/tools.test.ts`
- Test: `agent-adapter/test/workflows.test.ts`

---

## Task 1: Lock The Cognitive Contract In Shared Types

**Files:**
- Modify: `shared/types.ts`
- Modify: `shared/runtime.js`
- Modify: `shared/runtime.d.ts`
- Test: `service/test/types.test.ts`

- [ ] **Step 1: Write failing type/runtime tests**

Add assertions in `service/test/types.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { RETRY_GUARD_REASONS } from '../../shared/types.js';

describe('knowledge system shared contract', () => {
  it('keeps historical blocked strategy reason available for existing retry events', () => {
    expect(RETRY_GUARD_REASONS).toContain('blocked_strategy_overlap');
  });
});
```

Add compile-only usage in the same file:

```ts
import type {
  Knowledge,
  KnowledgePromotion,
  RecoveryPacket,
  RetryGuardResult,
} from '../../shared/types.js';

it('models descriptive knowledge and injected retry advisories', () => {
  const knowledge: Knowledge = {
    id: 'know_1',
    agentId: 'agent-a',
    goalId: 'goal-a',
    sourceAttemptId: 'attempt-a',
    context: 'search stage with broad web search',
    observation: 'results were stale',
    hypothesis: 'aggregators lag official sources',
    implication: 'prefer official source checks before another aggregator pass',
    relatedStrategyTags: ['event_search'],
    createdAt: '2026-04-11T00:00:00.000Z',
  };

  const promotion: KnowledgePromotion = {
    id: 'promo_1',
    knowledgeId: knowledge.id,
    visibility: 'agent',
    agentId: 'agent-a',
    subject: 'event_search',
    condition: { stage: 'search' },
    summary: 'Official sources are more reliable than aggregators.',
    recommendation: 'Check organizer pages before another aggregator pass.',
    confidence: 0.7,
    supportCount: 1,
    createdAt: knowledge.createdAt,
    updatedAt: knowledge.createdAt,
  };

  const packet: RecoveryPacket = {
    agentId: 'agent-a',
    goalId: 'goal-a',
    goalTitle: 'Find an event',
    currentStage: 'search',
    successCriteria: ['Find one real event'],
    lastMeaningfulProgress: undefined,
    lastFailureSummary: 'aggregator returned stale links',
    avoidStrategies: [],
    preferredNextStep: 'Check official pages',
    recentAttempts: [],
    currentPolicy: {
      preferredNextStep: 'Check official pages',
      mustCheckBeforeRetry: ['Compare with previous path'],
    },
    relevantKnowledge: [knowledge],
    sharedWisdom: [promotion],
    openQuestions: ['Which organizer pages are authoritative?'],
    generatedAt: knowledge.createdAt,
  };

  const retryResult: RetryGuardResult = {
    allowed: true,
    reason: 'allowed',
    warnings: ['Strategy overlaps prior avoid_strategy; treat as risk, not a block.'],
    advisories: ['Prefer official source checks before another aggregator pass.'],
    knowledgeContext: [knowledge],
    referencedKnowledgeIds: [knowledge.id],
  };

  expect(packet.relevantKnowledge[0].id).toBe('know_1');
  expect(retryResult.allowed).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --dir service test -- test/types.test.ts
```

Expected: FAIL because `Knowledge`, `KnowledgePromotion`, and extended packet/result fields do not exist.

- [ ] **Step 3: Add minimal shared types**

Add to `shared/types.ts`:

```ts
export type KnowledgeVisibility = 'private' | 'agent' | 'global';

export type Knowledge = {
  id: string;
  agentId: string;
  goalId: string;
  sourceAttemptId?: string;
  context: string;
  observation: string;
  hypothesis: string;
  implication: string;
  relatedStrategyTags: string[];
  createdAt: string;
};

export type KnowledgePromotion = {
  id: string;
  knowledgeId: string;
  visibility: KnowledgeVisibility;
  agentId?: string;
  subject: string;
  condition: Record<string, unknown>;
  summary: string;
  recommendation: string;
  confidence: number;
  supportCount: number;
  createdAt: string;
  updatedAt: string;
};

export type RecoveryPacketCurrentPolicy = {
  preferredNextStep?: string;
  mustCheckBeforeRetry: string[];
};

export type RecoveryPacketRecentAttempt = {
  id: string;
  stage: string;
  actionTaken: string;
  result: AttemptResult;
  failureType?: FailureType;
  createdAt: string;
};

export type KnowledgeReferenceEvent = {
  id: string;
  agentId: string;
  goalId: string;
  retryCheckEventId?: string;
  knowledgeIds: string[];
  promotionIds: string[];
  decisionSurface: 'recovery_packet' | 'retry_guard';
  createdAt: string;
};
```

Extend `RecoveryPacket`:

```ts
  recentAttempts: RecoveryPacketRecentAttempt[];
  currentPolicy?: RecoveryPacketCurrentPolicy;
  relevantKnowledge: Knowledge[];
  sharedWisdom: KnowledgePromotion[];
  openQuestions: string[];
```

Extend `RetryGuardResult`:

```ts
  advisories?: string[];
  knowledgeContext?: Knowledge[];
  referencedKnowledgeIds?: string[];
```

- [ ] **Step 4: Run type test**

Run:

```bash
pnpm --dir service test -- test/types.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add shared/types.ts shared/runtime.js shared/runtime.d.ts service/test/types.test.ts
git commit -m "feat: define knowledge system contracts"
```

---

## Task 2: Add Knowledge Schema And Migration

**Files:**
- Modify: `service/src/db/schema.sql`
- Modify: `service/src/db/client.ts`
- Modify: `service/test/db.client-migration.test.ts`

- [ ] **Step 1: Write failing schema tests**

Add tests to `service/test/db.client-migration.test.ts`:

```ts
it('creates knowledge and promotion tables with agent-scoped constraints', () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');

  applySchema(db);

  const knowledgeColumns = db.prepare(`PRAGMA table_info(knowledge)`).all() as Array<{ name: string }>;
  expect(knowledgeColumns.map((c) => c.name)).toEqual(
    expect.arrayContaining([
      'id',
      'agent_id',
      'goal_id',
      'source_attempt_id',
      'context',
      'observation',
      'hypothesis',
      'implication',
      'related_strategy_tags',
      'created_at',
    ])
  );

  const promotionColumns = db.prepare(`PRAGMA table_info(knowledge_promotions)`).all() as Array<{ name: string }>;
  expect(promotionColumns.map((c) => c.name)).toEqual(
    expect.arrayContaining([
      'id',
      'knowledge_id',
      'visibility',
      'agent_id',
      'subject',
      'condition',
      'summary',
      'recommendation',
      'confidence',
      'support_count',
      'created_at',
      'updated_at',
    ])
  );

  const knowledgeFk = db.prepare(`PRAGMA foreign_key_list(knowledge)`).all();
  expect(knowledgeFk.length).toBeGreaterThan(0);
});

it('enforces promotion visibility agent rule', () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applySchema(db);

  expect(() => db.prepare(`
    INSERT INTO knowledge_promotions (
      id,
      knowledge_id,
      visibility,
      agent_id,
      subject,
      condition,
      summary,
      recommendation,
      confidence,
      support_count,
      created_at,
      updated_at
    )
    VALUES (
      'bad_private',
      'missing_knowledge',
      'private',
      NULL,
      'event_search',
      '{}',
      'summary',
      'recommendation',
      0.5,
      1,
      '2026-04-11T00:00:00.000Z',
      '2026-04-11T00:00:00.000Z'
    )
  `).run()).toThrow();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --dir service test -- test/db.client-migration.test.ts
```

Expected: FAIL because tables do not exist.

- [ ] **Step 3: Add SQLite schema**

Add to `service/src/db/schema.sql` after `reflections`:

```sql
CREATE TABLE IF NOT EXISTS knowledge (
  id                    TEXT PRIMARY KEY,
  agent_id              TEXT NOT NULL REFERENCES agents(id),
  goal_id               TEXT NOT NULL,
  source_attempt_id     TEXT,
  context               TEXT NOT NULL,
  observation           TEXT NOT NULL,
  hypothesis            TEXT NOT NULL,
  implication           TEXT NOT NULL,
  related_strategy_tags TEXT NOT NULL DEFAULT '[]',
  created_at            TEXT NOT NULL,
  UNIQUE(agent_id, id),
  FOREIGN KEY(agent_id, goal_id) REFERENCES goals(agent_id, id) ON DELETE CASCADE,
  FOREIGN KEY(agent_id, source_attempt_id) REFERENCES attempts(agent_id, id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_knowledge_agent_goal_created
  ON knowledge(agent_id, goal_id, created_at DESC);

CREATE TABLE IF NOT EXISTS knowledge_promotions (
  id             TEXT PRIMARY KEY,
  knowledge_id   TEXT NOT NULL,
  visibility     TEXT NOT NULL CHECK(visibility IN ('private', 'agent', 'global')),
  agent_id       TEXT,
  subject        TEXT NOT NULL,
  condition      TEXT NOT NULL DEFAULT '{}',
  summary        TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  confidence     REAL NOT NULL DEFAULT 0.5 CHECK(confidence >= 0 AND confidence <= 1),
  support_count  INTEGER NOT NULL DEFAULT 1 CHECK(support_count >= 1),
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  CHECK(
    (visibility = 'global' AND agent_id IS NULL)
    OR
    (visibility IN ('private', 'agent') AND agent_id IS NOT NULL)
  ),
  FOREIGN KEY(knowledge_id) REFERENCES knowledge(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_knowledge_promotions_visibility_subject
  ON knowledge_promotions(visibility, subject);

CREATE INDEX IF NOT EXISTS idx_knowledge_promotions_agent
  ON knowledge_promotions(agent_id, visibility);
```

Add optional reference event table after `retry_check_events` if the implementation needs durable proof that injected knowledge was shown:

```sql
CREATE TABLE IF NOT EXISTS knowledge_reference_events (
  id                    TEXT PRIMARY KEY,
  agent_id              TEXT NOT NULL REFERENCES agents(id),
  goal_id               TEXT NOT NULL,
  retry_check_event_id  TEXT,
  knowledge_ids         TEXT NOT NULL DEFAULT '[]',
  promotion_ids         TEXT NOT NULL DEFAULT '[]',
  decision_surface      TEXT NOT NULL CHECK(decision_surface IN ('recovery_packet', 'retry_guard')),
  created_at            TEXT NOT NULL,
  FOREIGN KEY(agent_id, goal_id) REFERENCES goals(agent_id, id) ON DELETE CASCADE,
  FOREIGN KEY(retry_check_event_id) REFERENCES retry_check_events(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_knowledge_reference_events_agent_goal_created
  ON knowledge_reference_events(agent_id, goal_id, created_at DESC);
```

- [ ] **Step 4: Update migration**

In `service/src/db/client.ts`, add `CREATE TABLE IF NOT EXISTS` execution through `schema.sql` only for new tables. Do not backfill knowledge rows from old data in this task.

Also add a dedicated follow-up test for existing legacy core tables:

```ts
it('recreates legacy attempts table with composite foreign keys', () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
CREATE TABLE goals (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  success_criteria TEXT NOT NULL,
  stop_conditions TEXT NOT NULL,
  priority INTEGER NOT NULL,
  current_stage TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE attempts (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  stage TEXT NOT NULL,
  action_taken TEXT NOT NULL,
  strategy_tags TEXT NOT NULL,
  result TEXT NOT NULL,
  failure_type TEXT,
  confidence REAL,
  next_hypothesis TEXT,
  created_at TEXT NOT NULL
);
INSERT INTO goals VALUES ('g1', 'Goal', 'active', '[]', '[]', 1, 'init', 't', 't');
INSERT INTO attempts VALUES ('a1', 'g1', 'init', 'action', '[]', 'success', NULL, NULL, NULL, 't');
`);

  applySchema(db);

  const attemptFks = db.prepare(`PRAGMA foreign_key_list(attempts)`).all();
  expect(attemptFks.length).toBeGreaterThan(0);
});
```

Implement legacy recreation for core tables only if this test fails. Use transaction-safe `ALTER TABLE ... RENAME TO ...`, recreate table from `schema.sql` compatible DDL, copy data with `agent_id = DEFAULT_AGENT_ID`, then drop legacy table.

- [ ] **Step 5: Run migration tests**

Run:

```bash
pnpm --dir service test -- test/db.client-migration.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add service/src/db/schema.sql service/src/db/client.ts service/test/db.client-migration.test.ts
git commit -m "feat: add knowledge schema"
```

---

## Task 3: Implement Knowledge Repositories

**Files:**
- Create: `service/src/repos/knowledge.repo.ts`
- Create: `service/src/repos/knowledge-promotion.repo.ts`
- Create: `service/src/repos/knowledge-reference-event.repo.ts`
- Test: `service/test/knowledge.repo.test.ts`

- [ ] **Step 1: Write failing repo tests**

Create `service/test/knowledge.repo.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { makeTestDb, nowIso, testId } from './helpers.js';
import { GoalRepo } from '../src/repos/goal.repo.js';
import { AttemptRepo } from '../src/repos/attempt.repo.js';
import { KnowledgeRepo } from '../src/repos/knowledge.repo.js';
import { KnowledgePromotionRepo } from '../src/repos/knowledge-promotion.repo.js';

function seedGoal(agentId: string, goalId: string) {
  const db = makeTestDb();
  const goalRepo = new GoalRepo(db);
  goalRepo.create({
    id: goalId,
    agentId,
    title: `${agentId} goal`,
    status: 'active',
    successCriteria: ['succeed'],
    stopConditions: [],
    priority: 1,
    currentStage: 'search',
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
  return { db, goalRepo };
}

describe('KnowledgeRepo', () => {
  it('creates and lists knowledge scoped to one agent and goal', () => {
    const { db } = seedGoal('agent-a', 'goal-a');
    const repo = new KnowledgeRepo(db);

    repo.create({
      id: 'know-a',
      agentId: 'agent-a',
      goalId: 'goal-a',
      context: 'search stage',
      observation: 'aggregator failed',
      hypothesis: 'stale index',
      implication: 'check official sources',
      relatedStrategyTags: ['event_search'],
      createdAt: nowIso(),
    });

    expect(repo.listByGoal('agent-a', 'goal-a')).toHaveLength(1);
    expect(repo.listByGoal('agent-b', 'goal-a')).toHaveLength(0);
  });

  it('rejects knowledge for another agent goal', () => {
    const { db } = seedGoal('agent-a', 'goal-a');
    const repo = new KnowledgeRepo(db);

    expect(() => repo.create({
      id: 'know-cross',
      agentId: 'agent-b',
      goalId: 'goal-a',
      context: 'bad context',
      observation: 'bad observation',
      hypothesis: 'bad hypothesis',
      implication: 'bad implication',
      relatedStrategyTags: [],
      createdAt: nowIso(),
    })).toThrow();
  });
});

describe('KnowledgePromotionRepo', () => {
  it('returns agent scoped and global wisdom without returning another agent private wisdom', () => {
    const { db } = seedGoal('agent-a', 'goal-a');
    const knowledgeRepo = new KnowledgeRepo(db);
    const promotionRepo = new KnowledgePromotionRepo(db);

    knowledgeRepo.create({
      id: 'know-a',
      agentId: 'agent-a',
      goalId: 'goal-a',
      context: 'search stage',
      observation: 'aggregator failed',
      hypothesis: 'stale index',
      implication: 'check official sources',
      relatedStrategyTags: ['event_search'],
      createdAt: nowIso(),
    });

    promotionRepo.create({
      id: 'promo-agent-a',
      knowledgeId: 'know-a',
      visibility: 'agent',
      agentId: 'agent-a',
      subject: 'event_search',
      condition: { stage: 'search' },
      summary: 'Aggregators can be stale.',
      recommendation: 'Check official sources.',
      confidence: 0.7,
      supportCount: 1,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });

    promotionRepo.create({
      id: 'promo-global',
      knowledgeId: 'know-a',
      visibility: 'global',
      subject: 'event_search',
      condition: {},
      summary: 'Prefer official sources for events.',
      recommendation: 'Check organizer pages.',
      confidence: 0.8,
      supportCount: 1,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });

    expect(promotionRepo.listSharedForAgent('agent-a', ['event_search']).map((p) => p.id)).toEqual(
      expect.arrayContaining(['promo-agent-a', 'promo-global'])
    );
    expect(promotionRepo.listSharedForAgent('agent-b', ['event_search']).map((p) => p.id)).toEqual(['promo-global']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --dir service test -- test/knowledge.repo.test.ts
```

Expected: FAIL because repos do not exist.

- [ ] **Step 3: Implement `KnowledgeRepo`**

Create `service/src/repos/knowledge.repo.ts`:

```ts
import Database from 'better-sqlite3';
import type { Knowledge } from '../../../shared/types.js';

type KnowledgeRow = {
  id: string;
  agent_id: string;
  goal_id: string;
  source_attempt_id: string | null;
  context: string;
  observation: string;
  hypothesis: string;
  implication: string;
  related_strategy_tags: string;
  created_at: string;
};

function rowToKnowledge(row: KnowledgeRow): Knowledge {
  return {
    id: row.id,
    agentId: row.agent_id,
    goalId: row.goal_id,
    sourceAttemptId: row.source_attempt_id ?? undefined,
    context: row.context,
    observation: row.observation,
    hypothesis: row.hypothesis,
    implication: row.implication,
    relatedStrategyTags: JSON.parse(row.related_strategy_tags) as string[],
    createdAt: row.created_at,
  };
}

export class KnowledgeRepo {
  constructor(private db: Database.Database) {}

  create(knowledge: Knowledge): void {
    this.db.prepare(`
      INSERT INTO knowledge (
        id,
        agent_id,
        goal_id,
        source_attempt_id,
        context,
        observation,
        hypothesis,
        implication,
        related_strategy_tags,
        created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      knowledge.id,
      knowledge.agentId,
      knowledge.goalId,
      knowledge.sourceAttemptId ?? null,
      knowledge.context,
      knowledge.observation,
      knowledge.hypothesis,
      knowledge.implication,
      JSON.stringify(knowledge.relatedStrategyTags),
      knowledge.createdAt
    );
  }

  getById(agentId: string, id: string): Knowledge | null {
    const row = this.db.prepare(`SELECT * FROM knowledge WHERE agent_id = ? AND id = ?`).get(agentId, id) as KnowledgeRow | undefined;
    return row ? rowToKnowledge(row) : null;
  }

  listByGoal(agentId: string, goalId: string, limit = 20): Knowledge[] {
    const rows = this.db.prepare(`
      SELECT * FROM knowledge
      WHERE agent_id = ? AND goal_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(agentId, goalId, Math.min(Math.max(limit, 1), 100)) as KnowledgeRow[];
    return rows.map(rowToKnowledge);
  }

  listByTags(agentId: string, goalId: string, tags: string[], limit = 20): Knowledge[] {
    const all = this.listByGoal(agentId, goalId, limit);
    if (tags.length === 0) return all;
    const tagSet = new Set(tags);
    return all.filter((item) => item.relatedStrategyTags.some((tag) => tagSet.has(tag)));
  }
}
```

- [ ] **Step 4: Implement promotion repo**

Create `service/src/repos/knowledge-promotion.repo.ts` with the same explicit row mapping pattern. Include methods:

```ts
create(promotion: KnowledgePromotion): void
getById(id: string): KnowledgePromotion | null
listSharedForAgent(agentId: string, subjects?: string[], limit?: number): KnowledgePromotion[]
```

`listSharedForAgent` SQL should return:

```sql
WHERE
  visibility = 'global'
  OR (agent_id = ? AND visibility IN ('private', 'agent'))
```

Then filter by `subject IN (...)` when subjects are provided. Use parameter placeholders only.

- [ ] **Step 5: Implement reference event repo**

Create `service/src/repos/knowledge-reference-event.repo.ts` with:

```ts
create(event: KnowledgeReferenceEvent): void
listByGoal(agentId: string, goalId: string, limit?: number): KnowledgeReferenceEvent[]
```

Store `knowledgeIds` and `promotionIds` as JSON strings.

- [ ] **Step 6: Run repo tests**

Run:

```bash
pnpm --dir service test -- test/knowledge.repo.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add service/src/repos/knowledge.repo.ts service/src/repos/knowledge-promotion.repo.ts service/src/repos/knowledge-reference-event.repo.ts service/test/knowledge.repo.test.ts
git commit -m "feat: add knowledge repositories"
```

---

## Task 4: Add Knowledge Service And Reflection Ingestion

**Files:**
- Create: `service/src/services/knowledge.service.ts`
- Modify: `service/src/services/policy.service.ts`
- Modify: `service/src/app.ts`
- Test: `service/test/knowledge.service.test.ts`
- Test: `service/test/policy.service.test.ts`

- [ ] **Step 1: Write failing service tests**

Create `service/test/knowledge.service.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { makeTestDb, nowIso } from './helpers.js';
import { GoalRepo } from '../src/repos/goal.repo.js';
import { AttemptRepo } from '../src/repos/attempt.repo.js';
import { KnowledgeRepo } from '../src/repos/knowledge.repo.js';
import { KnowledgePromotionRepo } from '../src/repos/knowledge-promotion.repo.js';
import { KnowledgeService } from '../src/services/knowledge.service.js';

describe('KnowledgeService', () => {
  it('builds descriptive knowledge from a failed attempt and reflection', () => {
    const db = makeTestDb();
    const goalRepo = new GoalRepo(db);
    const attemptRepo = new AttemptRepo(db);
    const knowledgeRepo = new KnowledgeRepo(db);
    const promotionRepo = new KnowledgePromotionRepo(db);
    const service = new KnowledgeService(knowledgeRepo, promotionRepo);

    goalRepo.create({
      id: 'goal-a',
      agentId: 'agent-a',
      title: 'Find event',
      status: 'active',
      successCriteria: ['Find one event'],
      stopConditions: [],
      priority: 1,
      currentStage: 'search',
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });

    attemptRepo.create({
      id: 'attempt-a',
      agentId: 'agent-a',
      goalId: 'goal-a',
      stage: 'search',
      actionTaken: 'Used broad aggregator search',
      strategyTags: ['event_search'],
      result: 'failure',
      failureType: 'tool_error',
      createdAt: nowIso(),
    });

    const knowledge = service.createFromReflection({
      agentId: 'agent-a',
      goalId: 'goal-a',
      attemptId: 'attempt-a',
      stage: 'search',
      actionTaken: 'Used broad aggregator search',
      strategyTags: ['event_search'],
      summary: 'Aggregator result was stale.',
      rootCause: 'Third-party pages lag organizer pages.',
      mustChange: 'Check official organizer pages.',
      createdAt: nowIso(),
    });

    expect(knowledge.context).toContain('search');
    expect(knowledge.observation).toBe('Aggregator result was stale.');
    expect(knowledge.hypothesis).toBe('Third-party pages lag organizer pages.');
    expect(knowledge.implication).toBe('Check official organizer pages.');
    expect(knowledge.relatedStrategyTags).toEqual(['event_search']);
    expect(knowledgeRepo.listByGoal('agent-a', 'goal-a')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --dir service test -- test/knowledge.service.test.ts
```

Expected: FAIL because service does not exist.

- [ ] **Step 3: Implement `KnowledgeService`**

Create `service/src/services/knowledge.service.ts`:

```ts
import { randomUUID } from 'node:crypto';
import type { Knowledge, KnowledgePromotion } from '../../../shared/types.js';
import type { KnowledgeRepo } from '../repos/knowledge.repo.js';
import type { KnowledgePromotionRepo } from '../repos/knowledge-promotion.repo.js';

export type CreateKnowledgeFromReflectionInput = {
  agentId: string;
  goalId: string;
  attemptId: string;
  stage: string;
  actionTaken: string;
  strategyTags: string[];
  summary: string;
  rootCause: string;
  mustChange: string;
  createdAt: string;
};

export type CreateKnowledgeInput = Omit<Knowledge, 'id' | 'createdAt'> & {
  id?: string;
  createdAt?: string;
};

export class KnowledgeService {
  constructor(
    private knowledgeRepo: KnowledgeRepo,
    private promotionRepo: KnowledgePromotionRepo
  ) {}

  create(input: CreateKnowledgeInput): Knowledge {
    const knowledge: Knowledge = {
      id: input.id ?? randomUUID(),
      agentId: input.agentId,
      goalId: input.goalId,
      sourceAttemptId: input.sourceAttemptId,
      context: input.context,
      observation: input.observation,
      hypothesis: input.hypothesis,
      implication: input.implication,
      relatedStrategyTags: input.relatedStrategyTags,
      createdAt: input.createdAt ?? new Date().toISOString(),
    };
    this.knowledgeRepo.create(knowledge);
    return knowledge;
  }

  createFromReflection(input: CreateKnowledgeFromReflectionInput): Knowledge {
    return this.create({
      agentId: input.agentId,
      goalId: input.goalId,
      sourceAttemptId: input.attemptId,
      context: `Stage: ${input.stage}; action: ${input.actionTaken}`,
      observation: input.summary,
      hypothesis: input.rootCause,
      implication: input.mustChange,
      relatedStrategyTags: input.strategyTags,
      createdAt: input.createdAt,
    });
  }

  listRelevant(agentId: string, goalId: string, tags: string[], limit = 20): Knowledge[] {
    return this.knowledgeRepo.listByTags(agentId, goalId, tags, limit);
  }

  listSharedWisdom(agentId: string, subjects: string[], limit = 20): KnowledgePromotion[] {
    return this.promotionRepo.listSharedForAgent(agentId, subjects, limit);
  }
}
```

- [ ] **Step 4: Integrate with `PolicyService`**

Modify constructor:

```ts
constructor(
  private db: Database.Database,
  private goalRepo: GoalRepo,
  private attemptRepo: AttemptRepo,
  private reflectionRepo: ReflectionRepo,
  private policyRepo: PolicyRepo,
  private knowledgeService?: KnowledgeService
) {}
```

Inside `writeReflectionAndUpdatePolicy`, after reflection creation and before policy return, fetch the failed attempt and call `createFromReflection`.

Keep all writes inside the existing transaction. Return shape:

```ts
export type WriteReflectionResult = {
  reflection: Reflection;
  policy: Policy;
  knowledge?: Knowledge;
};
```

- [ ] **Step 5: Update policy service tests**

Add to `service/test/policy.service.test.ts`:

```ts
it('creates descriptive knowledge when writing a reflection', () => {
  const result = policyService.writeReflectionAndUpdatePolicy({
    agentId: 'goal-engine-demo',
    goalId,
    attemptId,
    summary: 'Search results were stale.',
    rootCause: 'Aggregator lag.',
    mustChange: 'Check official pages.',
    avoidStrategy: 'event_search',
    createdAt: nowIso(),
  });

  expect(result.knowledge).toEqual(
    expect.objectContaining({
      observation: 'Search results were stale.',
      hypothesis: 'Aggregator lag.',
      implication: 'Check official pages.',
    })
  );
});
```

- [ ] **Step 6: Run service tests**

Run:

```bash
pnpm --dir service test -- test/knowledge.service.test.ts test/policy.service.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add service/src/services/knowledge.service.ts service/src/services/policy.service.ts service/src/app.ts service/test/knowledge.service.test.ts service/test/policy.service.test.ts
git commit -m "feat: derive knowledge from reflections"
```

---

## Task 5: Add Knowledge API Routes

**Files:**
- Create: `service/src/routes/knowledge.ts`
- Modify: `service/src/app.ts`
- Test: `service/test/routes.knowledge.test.ts`

- [ ] **Step 1: Write failing route tests**

Create `service/test/routes.knowledge.test.ts`:

```ts
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
```

- [ ] **Step 2: Run route tests to verify failure**

Run:

```bash
pnpm --dir service test -- test/routes.knowledge.test.ts
```

Expected: FAIL because route does not exist.

- [ ] **Step 3: Implement route**

Create `service/src/routes/knowledge.ts` with endpoints:

```text
POST /api/v1/knowledge
GET  /api/v1/knowledge?goal_id=...
POST /api/v1/knowledge/:knowledgeId/promotions
GET  /api/v1/knowledge/shared?subjects=a,b
```

Validation rules:

- `agent_id` is never accepted from request body.
- `goal_id` must belong to caller agent.
- `source_attempt_id`, if provided, must belong to caller agent and same goal.
- Promotion `visibility = global` is allowed only when request includes `reviewed: true` for now. This is a lightweight service-level gate until a review UI exists.

Use `zValidator` and follow existing route error shapes.

- [ ] **Step 4: Wire route in app**

In `service/src/app.ts`, instantiate `KnowledgeRepo`, `KnowledgePromotionRepo`, `KnowledgeReferenceEventRepo`, `KnowledgeService`, then:

```ts
app.route('/api/v1/knowledge', knowledgeRouter(goalRepo, attemptRepo, knowledgeService));
```

- [ ] **Step 5: Run route tests**

Run:

```bash
pnpm --dir service test -- test/routes.knowledge.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add service/src/routes/knowledge.ts service/src/app.ts service/test/routes.knowledge.test.ts
git commit -m "feat: expose knowledge APIs"
```

---

## Task 6: Return Knowledge From Reflection Writes

**Files:**
- Modify: `service/src/routes/reflections.ts`
- Modify: `agent-adapter/src/tools/reflection-create.ts`
- Test: `service/test/routes.reflections-policies.test.ts`
- Test: `agent-adapter/test/tools.test.ts`

- [ ] **Step 1: Write failing route test**

Add to `service/test/routes.reflections-policies.test.ts`:

```ts
it('returns descriptive knowledge when a reflection is created', async () => {
  const res = await app.request('/api/v1/reflections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      goal_id: goalId,
      attempt_id: failAttemptId,
      summary: 'The aggregator page timed out.',
      root_cause: 'The site is unreliable in automation.',
      must_change: 'Use official event pages first.',
      avoid_strategy: 'event_search',
    }),
  });

  expect(res.status).toBe(201);
  const body = await res.json() as {
    data: {
      knowledge: {
        context: string;
        observation: string;
        hypothesis: string;
        implication: string;
        related_strategy_tags: string[];
      };
    };
  };

  expect(body.data.knowledge.observation).toBe('The aggregator page timed out.');
  expect(body.data.knowledge.hypothesis).toBe('The site is unreliable in automation.');
  expect(body.data.knowledge.implication).toBe('Use official event pages first.');
  expect(body.data.knowledge.related_strategy_tags).toContain('broad-web-search');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --dir service test -- test/routes.reflections-policies.test.ts
```

Expected: FAIL because response lacks `knowledge`.

- [ ] **Step 3: Update route response**

In `service/src/routes/reflections.ts`, add `knowledge` to the response when `PolicyService` returns it:

```ts
knowledge: result.knowledge ? knowledgeToSnakeCase(result.knowledge) : undefined
```

Add helper:

```ts
function knowledgeToSnakeCase(k: Knowledge) {
  return {
    id: k.id,
    agent_id: k.agentId,
    goal_id: k.goalId,
    source_attempt_id: k.sourceAttemptId,
    context: k.context,
    observation: k.observation,
    hypothesis: k.hypothesis,
    implication: k.implication,
    related_strategy_tags: k.relatedStrategyTags,
    created_at: k.createdAt,
  };
}
```

- [ ] **Step 4: Update agent adapter parser**

In `agent-adapter/src/tools/reflection-create.ts`, parse optional `knowledge`.

Add test in `agent-adapter/test/tools.test.ts` asserting reflection create returns `knowledge.observation`.

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm --dir service test -- test/routes.reflections-policies.test.ts
pnpm --dir agent-adapter test -- test/tools.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add service/src/routes/reflections.ts service/test/routes.reflections-policies.test.ts agent-adapter/src/tools/reflection-create.ts agent-adapter/test/tools.test.ts
git commit -m "feat: return knowledge from reflections"
```

---

## Task 7: Upgrade Recovery Packet To Cognitive Shape

**Files:**
- Modify: `service/src/services/recovery.service.ts`
- Modify: `service/src/routes/recovery.ts`
- Modify: `agent-adapter/src/tools/recovery-packet-get.ts`
- Test: `service/test/recovery.service.test.ts`
- Test: `service/test/routes.recovery.test.ts`
- Test: `agent-adapter/test/tools.test.ts`

- [ ] **Step 1: Write failing recovery service test**

Add to `service/test/recovery.service.test.ts`:

```ts
it('includes recent attempts, relevant knowledge, and shared wisdom', () => {
  // Seed one goal, one failed attempt, one knowledge row, and one global promotion.
  // Build the packet for the same agent and goal.
  const packet = recoveryService.build('goal-engine-demo', goalId);

  expect(packet?.recentAttempts[0]).toEqual(
    expect.objectContaining({
      actionTaken: 'Used broad aggregator search',
      result: 'failure',
    })
  );
  expect(packet?.relevantKnowledge[0]).toEqual(
    expect.objectContaining({
      observation: 'Aggregator result was stale.',
      implication: 'Check official organizer pages.',
    })
  );
  expect(packet?.sharedWisdom[0]).toEqual(
    expect.objectContaining({
      visibility: 'global',
      subject: 'event_search',
    })
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --dir service test -- test/recovery.service.test.ts
```

Expected: FAIL because `RecoveryService` does not depend on knowledge repos.

- [ ] **Step 3: Modify `RecoveryService` constructor**

Change constructor:

```ts
constructor(
  private goalRepo: GoalRepo,
  private attemptRepo: AttemptRepo,
  private policyRepo: PolicyRepo,
  private knowledgeService: KnowledgeService
) {}
```

In `build`, assemble:

- `recentAttempts`: latest 5 attempts for the goal.
- `currentPolicy`: `preferredNextStep` and `mustCheckBeforeRetry`.
- `relevantKnowledge`: goal knowledge filtered by latest failure tags when available.
- `sharedWisdom`: promotions matching latest attempt tags.
- `openQuestions`: deterministic strings from goal stage and known gaps.

Example:

```ts
const recentAttempts = this.attemptRepo.listByGoal(agentId, goalId, { limit: 5 });
const knowledgeTags = latestFailure?.strategyTags ?? recentAttempts.flatMap((a) => a.strategyTags);
const relevantKnowledge = this.knowledgeService.listRelevant(agentId, goalId, knowledgeTags, 10);
const sharedWisdom = this.knowledgeService.listSharedWisdom(agentId, knowledgeTags, 10);
```

- [ ] **Step 4: Update recovery route JSON**

In `service/src/routes/recovery.ts`, return both legacy and cognitive fields during transition:

```ts
data: {
  goal_id: packet.goalId,
  agent_id: packet.agentId,
  goal_title: packet.goalTitle,
  current_stage: packet.currentStage,
  success_criteria: packet.successCriteria,
  last_meaningful_progress: packet.lastMeaningfulProgress,
  last_failure_summary: packet.lastFailureSummary,
  avoid_strategies: packet.avoidStrategies,
  preferred_next_step: packet.preferredNextStep,
  current_policy: policyToSnakeCase(packet.currentPolicy),
  recent_attempts: packet.recentAttempts.map(attemptToSnakeCase),
  relevant_knowledge: packet.relevantKnowledge.map(knowledgeToSnakeCase),
  shared_wisdom: packet.sharedWisdom.map(promotionToSnakeCase),
  open_questions: packet.openQuestions,
  generated_at: packet.generatedAt,
}
```

- [ ] **Step 5: Update adapter parser**

In `agent-adapter/src/tools/recovery-packet-get.ts`, map:

- `recent_attempts` to `recentAttempts`
- `current_policy` to `currentPolicy`
- `relevant_knowledge` to `relevantKnowledge`
- `shared_wisdom` to `sharedWisdom`
- `open_questions` to `openQuestions`

Default arrays to `[]` to keep compatibility with older service responses.

- [ ] **Step 6: Run tests**

Run:

```bash
pnpm --dir service test -- test/recovery.service.test.ts test/routes.recovery.test.ts
pnpm --dir agent-adapter test -- test/tools.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add service/src/services/recovery.service.ts service/src/routes/recovery.ts service/test/recovery.service.test.ts service/test/routes.recovery.test.ts agent-adapter/src/tools/recovery-packet-get.ts agent-adapter/test/tools.test.ts
git commit -m "feat: include knowledge in recovery packets"
```

---

## Task 8: Convert Retry Guard From Hard Ban To Knowledge Advisory

**Files:**
- Modify: `service/src/services/retry-guard.service.ts`
- Modify: `service/src/routes/retry-guard.ts`
- Modify: `shared/types.ts`
- Test: `service/test/retry-guard.service.test.ts`
- Test: `service/test/routes.retry-guard.test.ts`

- [ ] **Step 1: Write failing service tests**

Update `service/test/retry-guard.service.test.ts`:

```ts
it('allows avoid strategy overlap but emits advisory context', () => {
  const result = new RetryGuardService().check({
    policyAcknowledged: true,
    strategyTags: ['broad-web-search'],
    whatChanged: 'I have a new source list',
    policy: makePolicy(['broad-web-search']),
    latestFailureAttempt: makeFailureAttempt(['broad-web-search']),
    knowledgeContext: [
      {
        id: 'know_1',
        agentId: 'agent-a',
        goalId: 'goal-a',
        context: 'search stage',
        observation: 'Broad search returned stale results.',
        hypothesis: 'Aggregators lag official pages.',
        implication: 'Check official pages before repeating aggregator search.',
        relatedStrategyTags: ['broad-web-search'],
        createdAt: '2026-04-11T00:00:00.000Z',
      },
    ],
    sharedWisdom: [],
  });

  expect(result.allowed).toBe(true);
  expect(result.reason).toBe('allowed');
  expect(result.warnings).toEqual(
    expect.arrayContaining([expect.stringContaining('avoid_strategy')])
  );
  expect(result.advisories).toEqual(
    expect.arrayContaining([expect.stringContaining('Check official pages')])
  );
  expect(result.referencedKnowledgeIds).toEqual(['know_1']);
});
```

Also update or replace the old test that expected `blocked_strategy_overlap` to block. Keep one historical reason test in `types.test.ts` only.

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
pnpm --dir service test -- test/retry-guard.service.test.ts
```

Expected: FAIL because `RetryGuardCheckInput` lacks knowledge fields and overlap still blocks.

- [ ] **Step 3: Modify Retry Guard input**

Add to `RetryGuardCheckInput`:

```ts
knowledgeContext?: Knowledge[];
sharedWisdom?: KnowledgePromotion[];
```

Replace hard block:

```ts
if (hasOverlap) {
  warnings.push('Strategy overlaps legacy avoid_strategy; treat this as risk context, not a hard block.');
}
```

Build advisories:

```ts
const advisories = [
  ...(input.knowledgeContext ?? []).map((k) => k.implication),
  ...(input.sharedWisdom ?? []).map((w) => w.recommendation),
].filter(Boolean);
```

Return `advisories`, `knowledgeContext`, and `referencedKnowledgeIds` in all outcomes.

Keep these hard blocks:

- `policy_not_acknowledged`
- `no_meaningful_change`
- `repeated_failure_without_downgrade`

Reasoning: the design specifically removes prescriptive strategy bans, not all safety gates.

- [ ] **Step 4: Update route to load knowledge**

In `service/src/routes/retry-guard.ts`, before calling `guardService.check`:

```ts
const knowledgeContext = knowledgeService.listRelevant(agentId, data.goal_id, data.strategy_tags, 10);
const sharedWisdom = knowledgeService.listSharedWisdom(agentId, data.strategy_tags, 10);
```

Persist `knowledge_reference_events` after `retryHistoryRepo.create`.

- [ ] **Step 5: Write route test for advisory**

Add to `service/test/routes.retry-guard.test.ts`:

```ts
it('injects knowledge and allows legacy avoid_strategy overlap when the retry has meaningful change', async () => {
  // Seed goal, failed attempt, reflection with avoid_strategy, generated knowledge.
  // Then POST /api/v1/retry-guard/check with same strategy tag but meaningful what_changed.
  // Assert allowed true, warnings non-empty, advisories include knowledge implication.
});
```

- [ ] **Step 6: Run retry guard tests**

Run:

```bash
pnpm --dir service test -- test/retry-guard.service.test.ts test/routes.retry-guard.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add shared/types.ts service/src/services/retry-guard.service.ts service/src/routes/retry-guard.ts service/test/retry-guard.service.test.ts service/test/routes.retry-guard.test.ts
git commit -m "feat: turn retry guard bans into advisories"
```

---

## Task 9: Surface Knowledge In OpenClaw Adapter Outputs

**Files:**
- Create: `agent-adapter/src/tools/knowledge-create.ts`
- Modify: `agent-adapter/src/tools/recovery-packet-get.ts`
- Modify: `agent-adapter/src/openclaw/dispatch-entrypoint.ts`
- Modify: `agent-adapter/src/workflows/show-goal-status.ts`
- Modify: `agent-adapter/src/workflows/recover-goal-session.ts`
- Test: `agent-adapter/test/tools.test.ts`
- Test: `agent-adapter/test/workflows.test.ts`

- [ ] **Step 1: Write failing adapter workflow test**

Add to `agent-adapter/test/workflows.test.ts`:

```ts
it('shows relevant knowledge in goal status output', async () => {
  const client = fakeClient({
    currentGoal: {
      id: 'goal-a',
      agentId: 'agent-a',
      title: 'Find event',
      status: 'active',
      successCriteria: ['Find one event'],
      stopConditions: [],
      priority: 1,
      currentStage: 'search',
      createdAt: '2026-04-11T00:00:00.000Z',
      updatedAt: '2026-04-11T00:00:00.000Z',
    },
    recoveryPacket: {
      agentId: 'agent-a',
      goalId: 'goal-a',
      goalTitle: 'Find event',
      currentStage: 'search',
      successCriteria: ['Find one event'],
      avoidStrategies: [],
      relevantKnowledge: [
        {
          id: 'know_1',
          agentId: 'agent-a',
          goalId: 'goal-a',
          context: 'search stage',
          observation: 'Aggregator was stale.',
          hypothesis: 'Third-party index lag.',
          implication: 'Check official pages.',
          relatedStrategyTags: ['event_search'],
          createdAt: '2026-04-11T00:00:00.000Z',
        },
      ],
      sharedWisdom: [],
      recentAttempts: [],
      openQuestions: [],
      generatedAt: '2026-04-11T00:00:00.000Z',
    },
  });

  const result = await showGoalStatus(client);
  expect(result.markdown).toContain('历史认知');
  expect(result.markdown).toContain('Check official pages.');
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
pnpm --dir agent-adapter test -- test/workflows.test.ts
```

Expected: FAIL because workflows do not render knowledge.

- [ ] **Step 3: Update adapter tools**

Implement `agent-adapter/src/tools/knowledge-create.ts`:

```ts
export async function knowledgeCreate(client: AdapterClient, input: KnowledgeCreateInput): Promise<Knowledge> {
  const raw = await client.post<KnowledgeSnake>('/api/v1/knowledge', {
    goal_id: input.goalId,
    source_attempt_id: input.sourceAttemptId,
    context: input.context,
    observation: input.observation,
    hypothesis: input.hypothesis,
    implication: input.implication,
    related_strategy_tags: input.relatedStrategyTags,
  });
  return toCamel(raw);
}
```

- [ ] **Step 4: Render knowledge in OpenClaw-facing workflows**

In `show-goal-status` and recovery workflow markdown, add a concise section:

```md
## 历史认知

- 观察：...
  可能原因：...
  对下一步意味着：...

## 共享建议

- ...
```

Keep wording descriptive. Do not say “禁止”.

- [ ] **Step 5: Run adapter tests**

Run:

```bash
pnpm --dir agent-adapter test -- test/tools.test.ts test/workflows.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add agent-adapter/src/tools/knowledge-create.ts agent-adapter/src/tools/recovery-packet-get.ts agent-adapter/src/openclaw/dispatch-entrypoint.ts agent-adapter/src/workflows/show-goal-status.ts agent-adapter/src/workflows/recover-goal-session.ts agent-adapter/test/tools.test.ts agent-adapter/test/workflows.test.ts
git commit -m "feat: inject knowledge into OpenClaw guidance"
```

---

## Task 10: Update Observer UI For Knowledge Evidence

**Files:**
- Modify: `service/src/routes/ui.ts`
- Modify: `service/src/ui/agent-detail.ts`
- Modify: `service/src/ui/timeline.ts`
- Test: `service/test/routes.ui-agents.test.ts`
- Test: `service/e2e/openclaw-user-experience.spec.ts`

- [ ] **Step 1: Write failing UI API test**

Add to `service/test/routes.ui-agents.test.ts`:

```ts
it('includes knowledge evidence in the selected agent detail view', async () => {
  // Seed goal, attempt, reflection, knowledge.
  const res = await app.request('/api/v1/ui/agents/goal-engine-demo');
  expect(res.status).toBe(200);
  const body = await res.json() as {
    data: {
      knowledge: Array<{
        observation: string;
        implication: string;
      }>;
      timeline: Array<{
        type: string;
        summary: string;
      }>;
    };
  };

  expect(body.data.knowledge).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        implication: 'Check official pages.',
      }),
    ])
  );
  expect(body.data.timeline).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: 'knowledge',
      }),
    ])
  );
});
```

- [ ] **Step 2: Run test to verify failure**

Run:

```bash
pnpm --dir service test -- test/routes.ui-agents.test.ts
```

Expected: FAIL because UI API has no `knowledge`.

- [ ] **Step 3: Extend agent detail builder**

In `service/src/ui/agent-detail.ts`, add knowledge to the selected agent view model. Read through `KnowledgeService` or repos with the selected `agentId`.

Important: `/ui` is observer-only. Do not add primary goal execution controls beyond existing debug/test helpers.

- [ ] **Step 4: Render knowledge in UI**

In `service/src/routes/ui.ts`, add a section with user-facing copy only:

```html
<section id="knowledge">
  <h2>历史认知</h2>
  ...
</section>
```

Avoid “系统说明自己有某功能” style copy. Show actual observations, hypotheses, implications.

- [ ] **Step 5: Update E2E**

In `service/e2e/openclaw-user-experience.spec.ts`, after recording a failed attempt/reflection, assert:

```ts
await expect(page.locator('#knowledge')).toContainText('Check official pages');
```

Also update brittle existing E2E assertions that expect two agents to have no history. Runtime alignment evidence can make one card non-empty.

- [ ] **Step 6: Run UI tests**

Run:

```bash
pnpm --dir service test -- test/routes.ui-agents.test.ts
pnpm --dir service test:e2e
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add service/src/routes/ui.ts service/src/ui/agent-detail.ts service/src/ui/timeline.ts service/test/routes.ui-agents.test.ts service/e2e/openclaw-user-experience.spec.ts
git commit -m "feat: show knowledge evidence in observer UI"
```

---

## Task 11: Add Stable Agent Context Error Handling

**Files:**
- Modify: `service/src/agent-context.ts`
- Modify: `service/src/app.ts`
- Test: `service/test/routes.goals.test.ts`

- [ ] **Step 1: Write failing error test**

Add to `service/test/routes.goals.test.ts`:

```ts
it('returns 422 for invalid X-Agent-Id instead of 500', async () => {
  const res = await app.request('/api/v1/goals/current', {
    headers: { 'X-Agent-Id': '../bad' },
  });

  expect(res.status).toBe(422);
  const body = await res.json() as { error: { code: string; message: string } };
  expect(body.error.code).toBe('validation_error');
  expect(body.error.message).toContain('X-Agent-Id');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
pnpm --dir service test -- test/routes.goals.test.ts
```

Expected: FAIL because current behavior is 500.

- [ ] **Step 3: Add typed error**

In `service/src/agent-context.ts`:

```ts
export class InvalidAgentIdError extends Error {
  constructor() {
    super('Invalid X-Agent-Id');
    this.name = 'InvalidAgentIdError';
  }
}
```

Throw `new InvalidAgentIdError()`.

- [ ] **Step 4: Add app error handler**

In `service/src/app.ts`, add:

```ts
app.onError((err, c) => {
  if (err instanceof InvalidAgentIdError) {
    return c.json({
      error: {
        code: 'validation_error',
        message: err.message,
      },
    }, 422);
  }
  throw err;
});
```

- [ ] **Step 5: Run route test**

Run:

```bash
pnpm --dir service test -- test/routes.goals.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add service/src/agent-context.ts service/src/app.ts service/test/routes.goals.test.ts
git commit -m "fix: return validation error for invalid agent id"
```

---

## Task 12: Full Verification And Documentation Sync

**Files:**
- Modify: `docs/isolation-and-knowledge-design.md`
- Modify: `docs/goal-engine-v0-api-contract.md`
- Modify: `docs/goal-engine-v0-data-model.md`
- Modify: `docs/goal-engine-v0-test-strategy.md`
- Optional Modify: `README.md`

- [ ] **Step 1: Run service build**

Run:

```bash
pnpm --dir service build
```

Expected: exit 0.

- [ ] **Step 2: Run agent adapter build**

Run:

```bash
pnpm --dir agent-adapter build
```

Expected: exit 0.

- [ ] **Step 3: Run service tests**

Run:

```bash
pnpm --dir service test
```

Expected: all tests pass.

- [ ] **Step 4: Run adapter tests**

Run:

```bash
pnpm --dir agent-adapter test
```

Expected: all tests pass.

- [ ] **Step 5: Run E2E tests**

Run:

```bash
pnpm --dir service test:e2e
```

Expected: all tests pass.

If Playwright browser binaries are missing:

```bash
pnpm --dir service exec playwright install chromium
pnpm --dir service test:e2e
```

- [ ] **Step 6: Run focused schema probes**

Run:

```bash
pnpm --dir service exec tsx -e "import Database from 'better-sqlite3'; import { applySchema } from './src/db/client.ts'; const db = new Database(':memory:'); db.pragma('foreign_keys = ON'); applySchema(db); console.log(db.prepare('PRAGMA table_info(knowledge)').all().map((r:any)=>r.name).join(',')); console.log(db.prepare('PRAGMA table_info(knowledge_promotions)').all().map((r:any)=>r.name).join(','));"
```

Expected output includes:

```text
id,agent_id,goal_id,source_attempt_id,context,observation,hypothesis,implication,related_strategy_tags,created_at
id,knowledge_id,visibility,agent_id,subject,condition,summary,recommendation,confidence,support_count,created_at,updated_at
```

- [ ] **Step 7: Run focused API probe**

Run:

```bash
pnpm --dir service exec tsx -e "import { createApp } from './src/app.ts'; import { makeTestDb } from './test/helpers.ts'; (async () => { const app = createApp(makeTestDb()); const goal = await app.request('/api/v1/goals', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Agent-Id': 'agent-a' }, body: JSON.stringify({ title: 'Probe goal', success_criteria: ['done'], stop_conditions: [], current_stage: 'search' }) }); const goalId = ((await goal.json()) as any).data.id; const know = await app.request('/api/v1/knowledge', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Agent-Id': 'agent-a' }, body: JSON.stringify({ goal_id: goalId, context: 'search', observation: 'stale result', hypothesis: 'lag', implication: 'check official source', related_strategy_tags: ['event_search'] }) }); console.log(know.status); const recovery = await app.request('/api/v1/recovery-packet?goal_id=' + goalId, { headers: { 'X-Agent-Id': 'agent-a' } }); const body = await recovery.json() as any; console.log(recovery.status, body.data.relevant_knowledge.length); })();"
```

Expected:

```text
201
200 1
```

- [ ] **Step 8: Update docs**

Update docs:

- In `docs/isolation-and-knowledge-design.md`, mark v0.2 implementation items as complete only after tests pass.
- In `docs/goal-engine-v0-api-contract.md`, add knowledge endpoints and cognitive Recovery Packet fields.
- In `docs/goal-engine-v0-data-model.md`, document `knowledge`, `knowledge_promotions`, and `knowledge_reference_events`.
- In `docs/goal-engine-v0-test-strategy.md`, add regression coverage for agent-scoped knowledge and non-blocking Retry Guard advisories.

- [ ] **Step 9: Review diff**

Run:

```bash
git diff --stat
git diff -- service/src/db/schema.sql shared/types.ts service/src/services/retry-guard.service.ts service/src/services/recovery.service.ts
```

Expected:

- No unrelated generated projection files.
- No hardcoded secrets.
- No UI copy that turns `/ui` into the primary interaction surface.
- No route accepts `agent_id` from request body.

- [ ] **Step 10: Final commit**

```bash
git add docs/isolation-and-knowledge-design.md docs/goal-engine-v0-api-contract.md docs/goal-engine-v0-data-model.md docs/goal-engine-v0-test-strategy.md README.md
git commit -m "docs: document knowledge system implementation"
```

---

## Acceptance Criteria

- `knowledge` table exists and enforces same-agent goal/attempt references.
- `knowledge_promotions` table exists with `private | agent | global` visibility and visibility/agent check constraint.
- Reflections create descriptive knowledge entries.
- Knowledge can be explicitly created/listed by API and cannot cross agent boundaries.
- Promotions can be created and shared according to visibility rules.
- Recovery Packet returns:
  - `current_policy`
  - `recent_attempts`
  - `relevant_knowledge`
  - `shared_wisdom`
  - `open_questions`
- Retry Guard no longer blocks solely because a strategy tag overlaps `avoid_strategies`.
- Retry Guard returns advisories and referenced knowledge IDs when knowledge is relevant.
- OpenClaw-facing status/recovery output includes historical cognition as context, not prohibitions.
- `/ui` observes knowledge evidence but remains observer-only.
- Invalid `X-Agent-Id` returns a stable 422 validation response.
- Builds, unit tests, adapter tests, and E2E tests pass.

## Risk Notes

- SQLite cannot `ALTER TABLE` in foreign keys. Legacy composite FK hardening requires table recreation, not just adding columns.
- Do not let `global` promotion become automatic pollution. Require explicit `reviewed: true` or keep global writes admin-only.
- Do not silently remove `blocked_strategy_overlap` from historical retry events until old DB rows and UI labels are migrated.
- Avoid deriving low-quality knowledge from every reflection forever. This implementation keeps the deterministic mapping simple; quality filtering can come later.
- Keep `/ui` as an observer. The actual product loop remains OpenClaw execution -> Goal Engine facts -> `/ui` observation.

## Suggested Execution Order

1. Tasks 1-3 create the contract and storage layer.
2. Tasks 4-6 add ingestion and APIs.
3. Tasks 7-9 turn knowledge into runtime guidance.
4. Task 10 exposes observer evidence.
5. Task 11 fixes the known validation defect.
6. Task 12 verifies and syncs documentation.
