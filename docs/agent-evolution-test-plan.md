# Agent Evolution Loop — E2E Test Plan

## Executive Summary

The `agent-evolution-loop.spec.ts` E2E test validates the **complete Goal Engine knowledge system evolution loop**: the full circuit from failure → reflection → knowledge creation → guidance update → new approach → evolution evidence at every system layer.

**What a passing test proves:** The Goal Engine correctly captures an agent's failure, auto-generates learnable knowledge from the reflection, updates guidance to avoid the failed path, serves the learned knowledge to a recovering agent, and makes all of this visible in the `/ui` observer page and in the SQLite database.

**Core thesis:** When an Agent fails, learns, and tries a new approach, the Goal Engine should capture this as evidence at every layer.

---

## Architecture Context

```
OpenClaw (CLI Agent, localhost:3000)
    │
    │ calls agent-adapter CLI
    │ bootstrap / start goal / record failed attempt / recover
    │
    ▼
Goal Engine Service (localhost:3210 in E2E)
    │
    ├── /api/v1/goals          — goal lifecycle
    ├── /api/v1/attempts       — record attempt (success/failure)
    ├── /api/v1/reflections    — record reflection + auto-create knowledge
    ├── /api/v1/retry-guard    — block repeated paths, allow new strategies
    ├── /api/v1/recovery-packet — serve learned context to recovering agent
    ├── /api/v1/knowledge      — knowledge CRUD
    │
    └── /ui/agents/:id        — HTML page + JSON API for observer UI
            │
            └── reads from SQLite DB
```

---

## Test File

**Location:** `service/e2e/agent-evolution-loop.spec.ts`

**Run command:**
```bash
cd /Users/gushuai/dev/Protocol30/goal-engine/service
pnpm test:e2e
```

**Prerequisites:**
- Goal Engine service must be running at `http://127.0.0.1:3210` (started automatically by `playwright.config.ts` via `pnpm dev`)
- Platform gateway at `localhost:3000` should be running for full browser experience
- The playwright config starts the Goal Engine service automatically

**Test isolation:** Each test run uses a fresh agent ID (`evolution-test-agent`) and a fresh database (unique per run via `E2E_DB_PATH`). The runtime state is saved and restored in `afterEach`.

---

## The Evolution Scenario

**Goal:** "Find and list TypeScript files in the repository"

**Evolution arc:**
1. Agent tries **web search** → fails (tool returns irrelevant results)
2. Reflection: "Web search cannot access local files. Switch to filesystem tools."
3. Knowledge auto-created from reflection
4. Retry guard blocks repeated web-search
5. Retry guard allows new approach: `find` command
6. Agent tries **filesystem tools** → succeeds

This mirrors a realistic developer workflow where the Agent pivots from a wrong tool to the correct one.

---

## Phase-by-Phase Breakdown

### Phase 0: Prerequisites Check

**What it does:** Calls `GET /api/v1/health` to verify the Goal Engine service is running.

**Why it exists:** All subsequent phases depend on the service. If it's not running, the test is skipped with a descriptive message.

**Evolution signal validated:** None (infrastructure check)

---

### Phase 1: Bootstrap Agent and Start Goal

**What it does:**
1. Calls `cd agent-adapter && pnpm openclaw bootstrap --service-url ...` with the test agent ID. This registers the agent in `.openclaw/runtime-state.json`.
2. Calls `POST /api/v1/goals` with `X-Agent-Id: evolution-test-agent` to create an active goal.

**Why it exists:** Establishes the anchor goal for the evolution loop. The goal must exist before any attempts can be recorded.

**Evolution signal validated:**
- `goalId` is captured (used by all subsequent phases)
- Goal status is `'active'`
- The goal is associated with the test agent via `goal_agent_assignments`

**Failure interpretation:**
- `POST /api/v1/goals` returns non-201 → The Goal Engine API is broken or the agent is not properly bootstrapped
- The goal is not `'active'` → The goal lifecycle is broken

---

### Phase 2: Record First Failed Attempt

**What it does:** Calls `POST /api/v1/attempts` with:
- `result: 'failure'`
- `failure_type: 'tool_error'`
- `strategy_tags: ['web-search', 'broad-search']`
- `action_taken`: "Tried web search for TypeScript files — returned generic results"

**Why it exists:** Creates the **evidence of failure** that drives the evolution loop. Without a recorded failure, there is nothing to learn from.

**Evolution signals validated:**
- `attempt1Id` is captured
- Attempt result is `'failure'`
- The attempt is associated with the goal (foreign key constraint)

**Failure interpretation:**
- Attempt not created → The attempt recording API is broken
- Attempt result is not `'failure'` → The result recording is broken

---

### Phase 3: Record Reflection — Auto-Knowledge Creation

**What it does:** Calls `POST /api/v1/reflections` with:
- `attempt_id: attempt1Id` (links to the failure)
- `summary`: "Web search returned irrelevant results..."
- `root_cause`: "The files are on the local filesystem, not on the web."
- `must_change`: "Switch to local filesystem tools: ls, find, or glob"
- `avoid_strategy: 'web-search'`

The reflection handler calls `policyService.writeReflectionAndUpdatePolicy()` which, inside a single SQLite transaction:
1. Writes the reflection to `reflections` table
2. Upserts the policy (sets `avoid_strategies=['web-search']`, `preferred_next_step="Switch to local..."`)
3. **Auto-creates a knowledge entry** via `knowledgeService.createFromReflection()` with:
   - `context`: Stage + action taken
   - `observation`: The reflection summary
   - `hypothesis`: The root cause
   - `implication`: The must-change directive
   - `related_strategy_tags`: The failed strategy tags

**Why it exists:** This is the **learning** step. The reflection is the agent's analysis of failure. The auto-created knowledge entry is what makes the failure learnable for future attempts and recoverable across sessions.

**Evolution signals validated:**
- `reflection1Id` is captured
- Policy contains `avoid_strategies: ['web-search']`
- Policy contains `preferred_next_step` (the guidance)
- `knowledge.id` is present in the response
- `knowledge.implication` contains "Switch to local filesystem tools"

**Failure interpretation:**
- `POST /api/v1/reflections` returns non-201 → The reflection API is broken
- `knowledge.id` is missing → The knowledge auto-creation in `policyService.writeReflectionAndUpdatePolicy()` is broken (check that `knowledgeService` is injected in `app.ts`)
- `knowledge.implication` is wrong → The knowledge creation logic in `KnowledgeService.createFromReflection()` is broken

---

### Phase 4: Retry Guard Blocks Old Strategy, Allows New Approach

**What it does:**
1. Calls `POST /api/v1/retry-guard/check` with the **same old strategy** (`web-search`, empty `what_changed`) → expects `allowed: false, reason: 'no_meaningful_change'`
2. Calls `POST /api/v1/retry-guard/check` with the **new strategy** (`local-fs`, `find-command`, meaningful `what_changed`) → expects `allowed: true`
3. Records Attempt #2 via `POST /api/v1/attempts` with `result: 'success'`

**Why it exists:** Proves the **evolution** — the retry guard correctly distinguishes between repeated failure (blocked) and meaningful change (allowed).

**Evolution signals validated:**
- `attempt2Id` is captured
- Old strategy blocked: `allowed === false, reason === 'no_meaningful_change'`
- New strategy allowed: `allowed === true`
- Second attempt: `result === 'success'`
- Second attempt `strategy_tags` are `['local-fs', 'find-command']` (different from first attempt)

**Failure interpretation:**
- Old strategy allowed → The retry guard is not blocking repeated paths; `RetryGuardService` is broken
- New strategy blocked → The retry guard is too strict; it should allow new strategies with meaningful change
- Second attempt has wrong strategy_tags → The evolution is not properly recorded

---

### Phase 5: Verify Recovery Packet Contains Knowledge

**What it does:** Calls `GET /api/v1/recovery-packet?goal_id=<goalId>`

The recovery packet builder (`RecoveryService.build()`) does:
1. Fetches the goal and policy
2. Finds the latest failure attempt
3. Finds relevant knowledge by matching strategy tags
4. Calls `knowledgeService.recordReference()` for each relevant knowledge (creates or increments `knowledge_promotions` at agent level)
5. Creates a `knowledge_reference_event` with `decision_surface='recovery_packet'`
6. Returns the full recovery packet including `relevant_knowledge` array

**Evolution signals validated:**
- `recoveryPacket.avoid_strategies` contains `'web-search'`
- `recoveryPacket.relevant_knowledge` has at least 1 entry
- At least one knowledge entry's `implication` contains "filesystem" or "local"
- `recoveryPacket.last_failure_summary` references the first failure

**Failure interpretation:**
- `relevant_knowledge` is empty → Knowledge was not created in Phase 3 OR the recovery packet is not finding relevant knowledge (check `KnowledgeService.listRelevant()`)
- `avoid_strategies` is empty → The policy was not updated from the reflection (check `PolicyService.writeReflectionAndUpdatePolicy()`)
- Knowledge implication doesn't match → The knowledge content is wrong

---

### Phase 6: Verify Evolution via Direct SQLite Query

**What it does:** Opens the SQLite database in read-only mode and verifies every evolution entity exists with correct values.

**Evolution signals validated (8 total):**

| Signal | What it proves | DB table | How to read it |
|--------|---------------|----------|----------------|
| 1. Goal exists | Evolution loop has a valid anchor | `goals` | `status='active'`, title contains "TypeScript files" |
| 2. Both attempts recorded | The loop has a failure and a success | `attempts` | 2 rows, results are 'failure' then 'success' |
| 3. Different action_taken | Evolution is behavioral, not just label change | `attempts` | `action_taken[1] !== action_taken[0]` |
| 4. Different strategy_tags | Evolution is at the strategy level | `attempts` | `tags[1]` is `['local-fs']`, `tags[0]` is `['web-search']` |
| 5. Reflection exists | Learning was recorded | `reflections` | `avoid_strategy='web-search'`, `must_change` contains "filesystem" |
| 6. Knowledge entry exists | Learning was persisted as learnable unit | `knowledge` | Has `source_attempt_id=attempt1Id`, `implication` mentions "filesystem" |
| 7. Knowledge promotion exists | Knowledge was promoted to agent level for reuse | `knowledge_promotions` | Has `visibility='agent'`, `agent_id=TEST_AGENT_ID` |
| 8. Knowledge reference event | Knowledge was used in a decision | `knowledge_reference_events` | `decision_surface='recovery_packet'`, contains the knowledge ID |

**Failure interpretation:**
- Any of signals 1-8 missing → That specific layer of the evolution loop is broken
- Signal 3 absent (same action_taken) → The evolution is not behavioral
- Signal 4 absent (same strategy_tags) → The evolution is not at the strategy level
- Signal 6 absent → Knowledge was not created (check `KnowledgeService.createFromReflection()`)
- Signal 7 absent → Knowledge promotion failed (check `KnowledgeService.recordReference()`)
- Signal 8 absent → The recovery packet builder did not create a reference event (check `RecoveryService.build()`)

---

### Phase 7: Verify Evolution Evidence in /ui API

**What it does:** Calls `GET /api/v1/ui/agents/evolution-test-agent` and verifies the full agent detail view contains evolution evidence.

**Evolution signals validated:**

| Signal | What it proves | UI field |
|--------|---------------|----------|
| Header agent_id matches | The test agent is properly tracked in the UI | `header.agent_id` |
| Current goal is shown | The evolution goal is active | `header.current_goal` is truthy |
| Avoid strategies visible | Guidance from reflection is in UI | `current_state.avoid_strategies` includes `'web-search'` |
| Recommended next step visible | Learning is surfaced to observers | `current_state.recommended_next_step` is truthy |
| Knowledge entries visible | Learning is shown in UI | `knowledge` array has ≥1 entry with "filesystem" implication |
| Timeline has failure | Failure is in the timeline | `timeline` contains event with `type='failure'` |
| Timeline has progress | Success is in the timeline | `timeline` contains event with `type='progress'` |
| Timeline shows evolution arc | Failure → progress transition visible | Both events exist (showing the arc) |
| Goal history shows evolution goal | Goal is tracked in history | `goal_history` contains goal with `status='active'` |

**Failure interpretation:**
- `avoid_strategies` empty → Policy was not persisted or not surfaced in UI (check `PolicyService.writeReflectionAndUpdatePolicy()`)
- `knowledge` empty → Knowledge was not created or not surfaced in UI
- Timeline missing events → The `buildTimeline()` function is not including the events (check `service/src/ui/timeline.ts`)
- Timeline shows wrong arc → Events exist but in wrong order or wrong types

---

### Phase 8: Verify Page HTML Renders Evolution Evidence

**What it does:** Uses Playwright `page` fixture to navigate to `/ui/agents/evolution-test-agent`, loads the full HTML page, and verifies it contains key evolution evidence text.

**Evolution signals validated:**
- Page contains `'web-search'` → The avoided strategy is rendered
- Page contains `'filesystem'` → The learning from reflection is rendered
- Page contains timeline element → Timeline is rendered in HTML

**Why it exists:** Validates that the human-readable `/ui` page (not just the JSON API) is also rendering the evolution evidence. This is the "observer experience" — when someone opens `/ui` in a browser, they should see the agent learning.

**Failure interpretation:**
- Page missing evidence → The HTML rendering is broken (check `service/src/routes/ui.ts`)
- Page navigates to wrong agent → The agent registration is broken

---

## What a Passing Test Proves

A fully passing test (`✓` on all 8 phases) proves:

1. **Failure capture:** The Goal Engine correctly records an agent's failed attempt with strategy tags and failure type
2. **Learning pipeline:** When a reflection is recorded, the Goal Engine auto-creates a learnable knowledge entry
3. **Guidance update:** The policy is updated to avoid the failed path and recommend the correct next step
4. **Retry enforcement:** The retry guard correctly blocks repeated failures and allows meaningful new approaches
5. **Knowledge promotion:** Learned knowledge is promoted to agent level for reuse across sessions
6. **Recovery context:** When the agent recovers, it receives the learned knowledge from its failures
7. **Full observability:** Every layer of the evolution loop is visible in the `/ui` observer page
8. **Database integrity:** All evolution evidence is correctly persisted in SQLite with proper foreign key relationships

---

## Interpreting Test Failures

| Phase | Failure symptom | Likely cause |
|-------|----------------|--------------|
| Phase 0 | `test.skip()` triggered | Goal Engine service not running. Start with `cd service && pnpm dev` |
| Phase 1 | `POST /goals` returns 404 | The agent is not bootstrapped. Check `bootstrapAgent()` CLI command |
| Phase 1 | `POST /goals` returns 422 | `InvalidAgentIdError`. The `X-Agent-Id` header format is wrong |
| Phase 2 | `POST /attempts` returns 404 | The goal doesn't exist. Phase 1 failed |
| Phase 3 | Knowledge missing from response | `knowledgeService` not injected into `PolicyService` in `app.ts` |
| Phase 4 | Old strategy not blocked | `RetryGuardService` is broken; `no_meaningful_change` is not detected |
| Phase 4 | New strategy blocked | `RetryGuardService` is too strict; new strategies with change are rejected |
| Phase 5 | `relevant_knowledge` empty | Knowledge not created (Phase 3) OR tag matching fails in `KnowledgeService.listRelevant()` |
| Phase 6 | Signal 6 missing | Knowledge not persisted. Check `KnowledgeService.createFromReflection()` |
| Phase 6 | Signal 7 missing | Promotion not created. Check `KnowledgeService.recordReference()` |
| Phase 6 | Signal 8 missing | Reference event not created. Check `recovery.ts` `knowledgeReferenceEventRepo.create()` |
| Phase 7 | `avoid_strategies` empty | Policy not persisted from Phase 3 |
| Phase 7 | Timeline wrong | `buildTimeline()` logic is broken |
| Phase 8 | Page not rendering | HTML template broken in `ui.ts` |

---

## Maintenance Notes

### If the evolution scenario changes

The test scenario ("find TypeScript files via filesystem tools") is designed to be:
- **Specific:** The goal is unambiguous
- **Failable:** The Agent WILL fail with the first approach (web search)
- **Recoverable:** A clear alternative approach exists (filesystem tools)
- **Observable:** The failure and success are clearly distinguishable in strategy tags

If changing the scenario, ensure the goal maintains these properties.

### If database schema changes

Phase 6 directly queries SQLite. If schema changes (column names, table names), update the queries in Phase 6 accordingly.

### If API response shapes change

Phases 3, 5, and 7 verify specific response shapes. If API shapes change, update the TypeScript type annotations in the test.

### If the agent bootstrapping changes

The `bootstrapAgent()` function in the test uses the agent-adapter CLI. If the CLI interface changes (e.g., different flags), update the `execFileAsync` call in Phase 1.

---

## Running Individual Phases

The phases are run serially with `test.describe.serial()`. To run just one phase for debugging:

```typescript
// In the test file, temporarily add .only:
test('Phase 3: ...').only;
```

Or run from the command line:
```bash
pnpm playwright test agent-evolution-loop.spec.ts --grep "Phase 3"
```
