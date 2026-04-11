# Agent Isolation Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Goal Engine facts isolated by OpenClaw Agent so one Agent cannot read or overwrite another Agent's goals, attempts, reflections, policies, retry checks, or recovery packets.

**Architecture:** Introduce a request-scoped `AgentContext` sourced from `X-Agent-Id`/OpenClaw runtime defaults, persist `agent_id` on core tables, and require repositories to query through `(agent_id, id)` or `(agent_id, goal_id)`. Keep legacy data by migrating it to the current managed agent fallback, then enforce per-agent active goal uniqueness.

**Tech Stack:** TypeScript, Hono, better-sqlite3, Vitest, existing OpenClaw adapter CLI.

---

## File Map

- Modify `shared/types.ts`: add `agentId` to `Goal`, `Attempt`, `Reflection`, `Policy`, `RecoveryPacket`, `RetryCheckEvent`, and `RecoveryEvent`.
- Create `service/src/agent-context.ts`: parse and validate `X-Agent-Id`, with local fallback for tests/OpenClaw defaults.
- Modify `service/src/db/schema.sql`: add `agents` table, `agent_id` columns, composite unique keys/FKs, and per-agent active goal index.
- Modify `service/src/db/client.ts`: migrate legacy SQLite databases by recreating affected tables and backfilling `agent_id`.
- Modify repos under `service/src/repos/*.ts`: require agent-scoped methods and include `agent_id` in inserts/queries.
- Modify services under `service/src/services/*.ts`: pass agent context through policy, recovery, retry, and goal-agent history flows.
- Modify routes under `service/src/routes/*.ts`: resolve `AgentContext` from headers and never accept `agent_id` from body.
- Modify `agent-adapter/src/client.ts`: inject `X-Agent-Id` from OpenClaw runtime config.
- Modify adapter tests and service tests: prove isolation and update expected payloads.

## Task 1: Route-Level Agent Isolation Tests

**Files:**
- Modify: `service/test/routes.goals.test.ts`
- Modify: `service/test/routes.attempts.test.ts`
- Modify: `service/test/routes.reflections-policies.test.ts`
- Modify: `service/test/routes.recovery.test.ts`
- Modify: `service/test/routes.retry-guard.test.ts`

- [x] **Step 1: Write failing tests**

Add tests proving:
- Agent A and Agent B can each create one active goal.
- `GET /api/v1/goals/current` returns the active goal for the caller's `X-Agent-Id`.
- Attempts created by Agent A are invisible when Agent B lists the same `goal_id`.
- Reflections/policies cannot be created across agent boundaries.
- Recovery and retry guard operate only on the caller agent's goal.

- [x] **Step 2: Run route tests and verify RED**

Run:

```bash
cd service
pnpm test -- test/routes.goals.test.ts test/routes.attempts.test.ts test/routes.reflections-policies.test.ts test/routes.recovery.test.ts test/routes.retry-guard.test.ts
```

Expected: fail because current schema and repos are global by `goal_id`.

## Task 2: Agent Context and Schema Migration

**Files:**
- Create: `service/src/agent-context.ts`
- Modify: `service/src/db/schema.sql`
- Modify: `service/src/db/client.ts`
- Modify: `service/test/db.client-migration.test.ts`

- [x] **Step 1: Write failing migration tests**

Add tests proving legacy DBs without `agent_id` migrate to default agent id and can then create separate active goals per agent.

- [x] **Step 2: Implement `AgentContext`**

Create:

```ts
export type AgentContext = { agentId: string };
export const DEFAULT_AGENT_ID = 'goal-engine-demo';
export function resolveAgentContext(headers: Headers): AgentContext;
```

Rules:
- Read `X-Agent-Id`.
- Trim and validate non-empty.
- Reject path separators, whitespace-only, and values longer than 128 chars.
- Fallback to `goal-engine-demo` for local/test calls without the header.

- [x] **Step 3: Implement SQLite migration**

Use transaction-safe table recreation for legacy tables:
- `goals`
- `attempts`
- `reflections`
- `policies`
- `retry_check_events`
- `recovery_events`

Backfill `agent_id = 'goal-engine-demo'` where missing.

- [x] **Step 4: Run migration tests**

Run:

```bash
cd service
pnpm test -- test/db.client-migration.test.ts
```

Expected: pass.

## Task 3: Repository Agent Scoping

**Files:**
- Modify: `shared/types.ts`
- Modify: `service/src/repos/goal.repo.ts`
- Modify: `service/src/repos/attempt.repo.ts`
- Modify: `service/src/repos/reflection.repo.ts`
- Modify: `service/src/repos/policy.repo.ts`
- Modify: `service/src/repos/retry-history.repo.ts`
- Modify: `service/src/repos/recovery-event.repo.ts`

- [x] **Step 1: Update failing repo tests**

Modify `service/test/repos.test.ts` to assert same `goal_id` or active status cannot leak across agent contexts.

- [x] **Step 2: Update types and repo signatures**

Examples:
- `goalRepo.getCurrent(agentId)`
- `goalRepo.getById(agentId, id)`
- `attemptRepo.listByGoal(agentId, goalId, opts)`
- `policyRepo.getByGoal(agentId, goalId)`

- [x] **Step 3: Run repo tests**

Run:

```bash
cd service
pnpm test -- test/repos.test.ts
```

Expected: pass.

## Task 4: Services and Routes

**Files:**
- Modify: `service/src/routes/goals.ts`
- Modify: `service/src/routes/attempts.ts`
- Modify: `service/src/routes/reflections.ts`
- Modify: `service/src/routes/policies.ts`
- Modify: `service/src/routes/recovery.ts`
- Modify: `service/src/routes/retry-guard.ts`
- Modify: `service/src/services/policy.service.ts`
- Modify: `service/src/services/recovery.service.ts`
- Modify: `service/src/services/goal-agent-history.service.ts`

- [x] **Step 1: Thread `AgentContext` through routes**

Resolve context at request boundary. Do not accept `agent_id` in body.

- [x] **Step 2: Thread `agentId` through service calls**

Policy, recovery, retry, and history services must only read facts for the caller agent.

- [x] **Step 3: Run route tests**

Run:

```bash
cd service
pnpm test -- test/routes.goals.test.ts test/routes.attempts.test.ts test/routes.reflections-policies.test.ts test/routes.recovery.test.ts test/routes.retry-guard.test.ts
```

Expected: pass.

## Task 5: Adapter Header Injection

**Files:**
- Modify: `agent-adapter/src/client.ts`
- Modify: `agent-adapter/src/openclaw/cli.ts`
- Modify: `agent-adapter/src/openclaw/dispatch-entrypoint.ts`
- Modify: `agent-adapter/test/tools.test.ts`
- Modify: `agent-adapter/test/openclaw-cli.test.ts`
- Modify: `agent-adapter/test/workflows.test.ts`

- [x] **Step 1: Write failing adapter tests**

Assert adapter HTTP calls include `X-Agent-Id` from runtime input/env.

- [x] **Step 2: Implement header injection**

Update `AdapterClient` to accept an optional `agentId` and include `X-Agent-Id`.

- [x] **Step 3: Run adapter tests**

Run:

```bash
cd agent-adapter
pnpm test
```

Expected: pass.

## Task 6: UI and Full Verification

**Files:**
- Modify: `service/src/ui/agent-detail.ts`
- Modify: `service/src/ui/agent-gallery.ts`
- Modify: `service/src/ui/observability.ts`
- Modify: `service/test/routes.ui-agents.test.ts`
- Modify: `service/e2e/openclaw-user-experience.spec.ts`

- [x] **Step 1: Update UI tests**

Assert agent detail reads current goal and timelines for the selected agent only.

- [x] **Step 2: Update UI data access**

When UI builds a selected agent view, use that agent id for all repo/service reads.

- [x] **Step 3: Run service test suite**

Run:

```bash
cd service
pnpm test
```

Expected: pass.

- [x] **Step 4: Run builds**

Run:

```bash
cd service
pnpm run build
cd ../agent-adapter
pnpm run build
```

Expected: both pass.
