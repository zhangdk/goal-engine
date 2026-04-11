# Goal Engine v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建 Goal Engine v0 的最小可实施闭环，让“失败后行为必须发生变化”在 service、adapter 和本地 projection 中可测试、可验证地成立。

**Architecture:** `service` 作为唯一事实源与规则执行层，负责 `Goal / Attempt / Reflection / Policy`、policy update、retry guard 和 recovery packet；`agent-adapter` 只负责 HTTP/tool 封装和字段映射；OpenClaw 本地文件只保留 projection。严格以 `docs/goal-engine-v0-implementation-baseline.md` 和 `docs/goal-engine-v0-test-strategy.md` 为准。

**Tech Stack:** TypeScript, Hono, SQLite, better-sqlite3, zod, vitest, NodeNext

---

## Eng Review Decisions

This plan has been engineering-reviewed against:

- `docs/goal-engine-v0-implementation-baseline.md`
- `docs/goal-engine-v0-test-strategy.md`
- `docs/goal-engine-v0-api-contract.md`
- `docs/goal-engine-v0-openclaw-integration.md`

Locked decisions for implementation:

- `POST /api/v1/reflections` remains synchronous and must be implemented as a single database transaction for `reflection insert + policy upsert`
- mandatory service endpoints include `PATCH /api/v1/goals/:goalId` and `GET /api/v1/attempts`
- all route references in this plan use `/api/v1/...`
- retry guard logic must implement the frozen baseline heuristics exactly, not approximate them loosely
- `last_meaningful_progress` is derived from the most recent `Attempt` with `result in ('success', 'partial')`, using that attempt's `action_taken` as the progress summary
- projection work must include a real refresh writer/helper, not only markdown templates
- shared contracts must come from one source file, not hand-copied service/adapter duplicates

ASCII diagrams required in code comments:

- `service/src/services/policy.service.ts` — reflection -> policy update pipeline
- `service/src/services/retry-guard.service.ts` — decision tree for allow/block reasons
- `service/src/services/recovery.service.ts` — recovery packet composition flow
- `service/test/integration.behavior-loop.test.ts` — end-to-end loop setup

---

## Task 0: Bootstrap and Execution Prerequisites

**Files:**

- Create: `service/package.json`
- Create: `service/tsconfig.json`
- Create: `service/vitest.config.ts`
- Create: `agent-adapter/package.json`
- Create: `agent-adapter/tsconfig.json`

- [ ] **Step 1: Record runtime prerequisites in package metadata or README comments**

Must state:

- required Node version
- required `pnpm` version
- `better-sqlite3` native build expectation
- how to run `pnpm install` for each package

- [ ] **Step 2: Scaffold package manifests**

Rules:

- include `test`, `build`, and local dev scripts
- keep dependency set minimal
- avoid introducing workspace tooling unless actually needed

- [ ] **Step 3: Install dependencies and verify test runner boots**

Run:

- `cd service && pnpm install`
- `cd agent-adapter && pnpm install`

Expected:

- installs succeed
- `pnpm test -- --help` works in both packages

---

## Scope Guard

本计划只覆盖 v0 必需能力：

- 单 active goal
- SQLite 单机存储
- `POST /reflections` 写入后同步更新 policy
- `POST /retry-guard/check` 的显式阻断
- `GET /recovery-packet` 的派生恢复能力
- adapter 侧 `reflection_generate` helper

本计划不覆盖：

- 服务端 `POST /reflections/generate`
- 多用户 / 多 workspace
- UI
- 历史版本树
- 多 agent 策略共享

---

## File Map

### Service

**Create:**

- `shared/types.ts`
- `service/src/db/schema.sql`
- `service/src/db/client.ts`
- `service/src/repos/goal.repo.ts`
- `service/src/repos/attempt.repo.ts`
- `service/src/repos/reflection.repo.ts`
- `service/src/repos/policy.repo.ts`
- `service/src/services/policy.service.ts`
- `service/src/services/retry-guard.service.ts`
- `service/src/services/recovery.service.ts`
- `service/src/routes/goals.ts`
- `service/src/routes/attempts.ts`
- `service/src/routes/reflections.ts`
- `service/src/routes/policies.ts`
- `service/src/routes/retry-guard.ts`
- `service/src/routes/recovery.ts`
- `service/src/routes/health.ts`
- `service/src/app.ts`
- `service/src/index.ts`
- `service/test/helpers.ts`
- `service/test/types.test.ts`
- `service/test/policy.service.test.ts`
- `service/test/retry-guard.service.test.ts`
- `service/test/recovery.service.test.ts`
- `service/test/repos.test.ts`
- `service/test/routes.goals.test.ts`
- `service/test/routes.attempts.test.ts`
- `service/test/routes.reflections-policies.test.ts`
- `service/test/routes.retry-guard.test.ts`
- `service/test/routes.recovery.test.ts`
- `service/test/integration.behavior-loop.test.ts`

### Agent Adapter

**Create:**

- `agent-adapter/src/config.ts`
- `agent-adapter/src/client.ts`
- `agent-adapter/src/tools/goal-get-current.ts`
- `agent-adapter/src/tools/attempt-append.ts`
- `agent-adapter/src/tools/reflection-generate.ts`
- `agent-adapter/src/tools/policy-get-current.ts`
- `agent-adapter/src/tools/retry-guard-check.ts`
- `agent-adapter/src/tools/recovery-packet-get.ts`
- `agent-adapter/src/index.ts`
- `agent-adapter/test/tools.test.ts`

### Projection

**Create later in examples or integration scaffold:**

- `examples/workspace/goal-engine/projection-writer.ts`
- `examples/workspace/goal-engine/current-goal.md`
- `examples/workspace/goal-engine/current-policy.md`
- `examples/workspace/goal-engine/recovery-packet.md`

---

## Task 1: Freeze Shared Types and Enums

**Files:**

- Create: `shared/types.ts`
- Create: `service/test/types.test.ts`

- [ ] **Step 1: Write failing tests for frozen enums and shared import path**

```ts
import { describe, expect, it } from 'vitest';
import type { FailureType, RetryGuardReason } from '../src/types.js';

describe('frozen enums', () => {
  it('freezes FailureType to 8 values', () => {
    const values: FailureType[] = [
      'tool_error',
      'capability_gap',
      'strategy_mismatch',
      'external_blocker',
      'resource_limit',
      'validation_fail',
      'stuck_loop',
      'ambiguous_goal',
    ];
    expect(values).toHaveLength(8);
  });

  it('freezes RetryGuardReason values', () => {
    const reasons: RetryGuardReason[] = [
      'allowed',
      'policy_not_acknowledged',
      'blocked_strategy_overlap',
      'no_meaningful_change',
      'repeated_failure_without_downgrade',
    ];
    expect(reasons).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Run tests to confirm failure**

Run: `cd service && pnpm test -- test/types.test.ts`

Expected: FAIL because frozen enums or import target do not exist yet.

- [ ] **Step 3: Implement shared types in `shared/types.ts`**

```ts
// shared/types.ts

export type FailureType =
  | 'tool_error'        // 工具调用失败（API 报错、权限不足、超时）
  | 'capability_gap'    // Agent 缺乏完成此任务的能力或知识
  | 'strategy_mismatch' // 方向选错，方法不适合这个问题
  | 'external_blocker'  // 被外部条件卡住（依赖未就绪、服务不可用）
  | 'resource_limit'    // 触碰 token/成本/时间上限
  | 'validation_fail'   // 产出结果但不满足成功标准
  | 'stuck_loop'        // 在同一步骤反复绕圈，没有实质推进
  | 'ambiguous_goal'    // 目标本身不清晰，无法判断下一步

export type GoalStatus = 'active' | 'blocked' | 'completed' | 'abandoned'
export type AttemptResult = 'success' | 'partial' | 'failure'

// RetryGuardReason 枚举所有决策结果
// 'downgrade' 定义：将下一轮缩减为更小子任务，或换用新工具/新输入材料
export type RetryGuardReason =
  | 'allowed'
  | 'policy_not_acknowledged'        // 有 policy 但本轮未声明已读取
  | 'blocked_strategy_overlap'       // strategyTags 与上次失败重叠率 > 60%
  | 'no_meaningful_change'           // whatChanged 为空或纯空白
  | 'repeated_failure_without_downgrade' // 连续 3+ 次同类 failureType 且未降维

export interface Goal {
  id: string
  title: string
  status: GoalStatus
  success_criteria: string[]   // JSON array stored as TEXT in SQLite
  stop_conditions: string[]
  priority: number             // 越大优先级越高，默认 1
  current_stage: string        // 默认 'initial'
  created_at: string           // ISO 8601 UTC
  updated_at: string
}

export interface Attempt {
  id: string
  goal_id: string
  stage: string
  action_taken: string
  strategy_tags: string[]      // 策略标签，供 retry guard 计算重叠率
  result: AttemptResult
  failure_type?: FailureType   // result='failure' 时必填
  confidence?: number          // 0-1
  next_hypothesis?: string
  created_at: string
}

export interface Reflection {
  id: string
  goal_id: string
  attempt_id: string           // 必须是同一 goal 下的 failure attempt
  summary: string
  root_cause: string
  must_change: string
  avoid_strategy?: string      // 短标签，如 'broad_web_search'
  created_at: string
}

export interface Policy {
  id: string
  goal_id: string              // UNIQUE，每个 goal 最多一条 policy
  preferred_next_step?: string
  avoid_strategies: string[]   // 累积追加，不替换
  must_check_before_retry: string[]
  updated_at: string
}

export interface RecoveryPacket {
  goal_id: string
  goal_title: string
  current_stage: string
  success_criteria: string[]
  last_meaningful_progress?: string  // 最近一次 success|partial attempt 的 action_taken
  last_failure_summary?: string      // 最近一次 reflection 的 summary
  avoid_strategies: string[]
  preferred_next_step?: string
  generated_at: string
}

export interface RetryGuardResult {
  allowed: boolean
  reason: RetryGuardReason
  warnings: string[]
  tag_overlap_rate?: number    // 与上次失败的 strategyTags 重叠率（0-1）
}
```

注意：Service 层使用 snake_case（与 SQLite 列名一致）；Agent Adapter 的 client.ts 负责转换为 camelCase 后对外暴露。

- [ ] **Step 4: Point both packages at the shared contract file**

Constraint:

- no hand-copied type duplication
- snake_case <-> camelCase mapping is adapter/client responsibility, not type-level drift

- [ ] **Step 5: Run tests to confirm pass**

Run: `cd service && pnpm test -- test/types.test.ts`

Expected: PASS

---

## Task 2: Define SQLite Schema and Repository Constraints

**Files:**

- Create: `service/src/db/schema.sql`
- Create: `service/src/db/client.ts`
- Create: `service/src/repos/goal.repo.ts`
- Create: `service/src/repos/attempt.repo.ts`
- Create: `service/src/repos/reflection.repo.ts`
- Create: `service/src/repos/policy.repo.ts`
- Create: `service/test/repos.test.ts`
- Create: `service/test/helpers.ts`

- [ ] **Step 1: Write failing repository/schema tests**

Test cases:

- only one active goal allowed
- one attempt can have at most one reflection
- one goal has one current policy
- `failure_type` required when `result = failure`
- reflection requires an existing attempt
- reflection goal must match attempt goal
- reflection target attempt must have `result = failure`

- [ ] **Step 2: Run schema tests to confirm failure**

Run: `cd service && pnpm test -- test/repos.test.ts`

Expected: FAIL because schema and repositories do not exist yet.

- [ ] **Step 3: Implement schema**

Schema requirements:

- tables: `goals`, `attempts`, `reflections`, `policies`
- unique active-goal constraint
- unique `attempt_id` on `reflections`
- unique `goal_id` on `policies`
- JSON text fields for arrays
- foreign-key integrity for `goal_id` and `attempt_id`

- [ ] **Step 4: Implement db client factory**

Requirements:

- no singleton
- test-friendly in-memory db support
- foreign keys enabled

- [ ] **Step 5: Implement repositories minimally**

Repository responsibilities:

- `goal.repo.ts`: create, getCurrent, patch
- `attempt.repo.ts`: create, listByGoal, getLatestFailure
- `reflection.repo.ts`: createByAttempt
- `policy.repo.ts`: getByGoal, upsertByGoal

- [ ] **Step 6: Run repository tests**

Run: `cd service && pnpm test -- test/repos.test.ts`

Expected: PASS

---

## Task 3: Implement Policy Service First

**Files:**

- Create: `service/src/services/policy.service.ts`
- Create: `service/test/policy.service.test.ts`

- [ ] **Step 1: Write failing unit tests**

Test cases:

- creates first policy from first reflection
- merges `avoid_strategy` idempotently
- updates `preferred_next_step` from latest reflection
- writes `must_check_before_retry` defaults
- transaction orchestration rolls back reflection persistence if policy upsert fails

- [ ] **Step 2: Run tests to confirm failure**

Run: `cd service && pnpm test -- test/policy.service.test.ts`

Expected: FAIL because service does not exist yet.

- [ ] **Step 3: Implement minimal policy service**

Behavior:

- takes reflection input
- upserts policy
- deduplicates `avoid_strategies`
- updates `preferred_next_step`
- ensures non-empty `must_check_before_retry`

- [ ] **Step 4: Run tests to confirm pass**

Run: `cd service && pnpm test -- test/policy.service.test.ts`

Expected: PASS

---

## Task 4: Implement Retry Guard Service Before HTTP Routes

**Files:**

- Create: `service/src/services/retry-guard.service.ts`
- Create: `service/test/retry-guard.service.test.ts`

- [ ] **Step 1: Write failing tests for each blocked reason**

Test cases:

- blocks when `policy_acknowledged = false`
- blocks when `strategy_tags` overlap blocked strategy
- blocks when no meaningful change exists
- blocks repeated same failure without downgrade
- allows when change is meaningful
- exact tag match counts as high similarity
- overlap rate `>= 0.7` counts as high similarity when `what_changed` is not meaningful

- [ ] **Step 2: Run tests to confirm failure**

Run: `cd service && pnpm test -- test/retry-guard.service.test.ts`

Expected: FAIL because guard service does not exist yet.

- [ ] **Step 3: Implement minimal guard logic**

Rules:

- use baseline reasons only
- compare against latest failure attempt
- no embeddings
- no LLM judgement
- exact same `strategy_tags` => high similarity
- overlap rate `>= 0.7` + no meaningful `what_changed` => high similarity
- only the frozen reasons are legal outputs

- [ ] **Step 4: Run tests to confirm pass**

Run: `cd service && pnpm test -- test/retry-guard.service.test.ts`

Expected: PASS

---

## Task 5: Implement Recovery Packet Builder

**Files:**

- Create: `service/src/services/recovery.service.ts`
- Create: `service/test/recovery.service.test.ts`

- [ ] **Step 1: Write failing unit tests**

Test cases:

- composes packet from goal + policy + recent history
- reflects latest policy changes on re-read
- does not require separate recovery storage
- derives `last_meaningful_progress` from latest `success|partial` attempt `action_taken`
- omits `last_meaningful_progress` when no non-failure attempt exists

- [ ] **Step 2: Run tests to confirm failure**

Run: `cd service && pnpm test -- test/recovery.service.test.ts`

Expected: FAIL because recovery service does not exist yet.

- [ ] **Step 3: Implement minimal recovery service**

Behavior:

- fetch current goal
- derive latest meaningful progress from most recent `success|partial` attempt `action_taken`
- fetch latest failure summary if any
- fetch current policy
- return derived packet

- [ ] **Step 4: Run tests to confirm pass**

Run: `cd service && pnpm test -- test/recovery.service.test.ts`

Expected: PASS

---

## Task 6: Add Route Validators and Route-level Contract Tests

**Files:**

- Create: `service/src/routes/goals.ts`
- Create: `service/src/routes/attempts.ts`
- Create: `service/src/routes/reflections.ts`
- Create: `service/src/routes/policies.ts`
- Create: `service/src/routes/retry-guard.ts`
- Create: `service/src/routes/recovery.ts`
- Create: `service/src/routes/health.ts`
- Create: `service/src/app.ts`
- Create: `service/src/index.ts`
- Create: `service/test/routes.goals.test.ts`
- Create: `service/test/routes.attempts.test.ts`
- Create: `service/test/routes.reflections-policies.test.ts`
- Create: `service/test/routes.retry-guard.test.ts`
- Create: `service/test/routes.recovery.test.ts`

- [ ] **Step 1: Write failing contract tests**

Minimum assertions:

- `POST /api/v1/goals` returns `201`
- `GET /api/v1/goals/current` returns `404 no_active_goal` when empty
- `PATCH /api/v1/goals/:goalId` updates allowed fields
- `POST /api/v1/attempts` rejects failure without `failure_type`
- `GET /api/v1/attempts` lists attempts for a goal
- `POST /api/v1/reflections` returns reflection + updated policy
- `GET /api/v1/policies/current` returns `404 no_policy_yet` when absent
- `POST /api/v1/retry-guard/check` returns `200` even when blocked
- `GET /api/v1/recovery-packet` returns derived packet
- invalid JSON returns `400 invalid_json`
- invalid fields return `422 validation_error`
- duplicate reflection returns `409 duplicate_reflection`
- state conflicts return `409 state_conflict`
- repository/service failures surface `500 internal_error`

- [ ] **Step 2: Run tests to confirm failure**

Run: `cd service && pnpm test -- test/routes.*.test.ts`

Expected: FAIL because routes do not exist yet.

- [ ] **Step 3: Implement routes minimally**

Constraints:

- JSON uses `snake_case`
- adapter mapping is not done in routes
- `POST /api/v1/reflections` must synchronously upsert policy inside one database transaction
- `POST /retry-guard/check` must never mutate business state
- do not implement `POST /reflections/generate` in this phase
- all routes must be registered under `/api/v1/...`

**Transaction pattern for `POST /api/v1/reflections`（必须使用，不能省略）：**

```ts
// service/src/routes/reflections.ts — 关键实现示例
import type Database from 'better-sqlite3'

export function reflectionRoutes(db: Database.Database) {
  const app = new Hono()
  const reflectionRepo = new ReflectionRepo(db)
  const policyRepo = new PolicyRepo(db)
  const policyService = new PolicyService(policyRepo)
  const attemptRepo = new AttemptRepo(db)

  // better-sqlite3 transaction：同步执行，任一步骤抛出则自动回滚
  const createReflectionWithPolicy = db.transaction(
    (input: CreateReflectionInput) => {
      const reflection = reflectionRepo.create(input)   // INSERT INTO reflections
      const policy = policyService.update(reflection)   // UPSERT policies
      return { reflection, policy }
    }
  )

  app.post('/api/v1/reflections', zValidator('json', createReflectionSchema), async (c) => {
    const input = c.req.valid('json')
    const attempt = attemptRepo.findById(input.attempt_id)
    if (!attempt || attempt.goal_id !== input.goal_id) {
      return c.json({ error: 'attempt_not_found' }, 404)
    }
    const result = createReflectionWithPolicy(input)  // 原子操作
    return c.json(result, 201)
  })

  return app
}
```

**服务构造函数签名（路由层组装时使用）：**

```ts
// PolicyService: 接收 PolicyRepo 实例
class PolicyService { constructor(private policyRepo: PolicyRepo) {} }

// RetryGuardService: 接收 AttemptRepo + PolicyRepo
class RetryGuardService { constructor(private attemptRepo: AttemptRepo, private policyRepo: PolicyRepo) {} }

// RecoveryService: 接收四个 repo
class RecoveryService { constructor(private goalRepo: GoalRepo, private attemptRepo: AttemptRepo, private reflectionRepo: ReflectionRepo, private policyRepo: PolicyRepo) {} }

// app.ts 中统一组装：
export function createApp(db: Database.Database) {
  const app = new Hono()
  app.route('/', healthRoutes())
  app.route('/', goalRoutes(db))
  app.route('/', attemptRoutes(db))
  app.route('/', reflectionRoutes(db))  // 包含事务
  app.route('/', policyRoutes(db))
  app.route('/', retryGuardRoutes(db))
  app.route('/', recoveryRoutes(db))
  return app
}
```

- [ ] **Step 4: Run route tests**

Run: `cd service && pnpm test -- test/routes.*.test.ts`

Expected: PASS

---

## Task 7: Add Full Behavior Loop Integration Test

**Files:**

- Create: `service/test/integration.behavior-loop.test.ts`

- [ ] **Step 1: Write failing integration test**

Scenario（每步必须包含断言，不能只断言状态码）：

1. `POST /api/v1/goals` → 断言 `status === 'active'`, `id` 存在
2. `POST /api/v1/attempts` with `strategy_tags: ['broad-web-search']`, `result: 'failure'`, `failure_type: 'strategy_mismatch'` → 断言 `strategy_tags` 保存正确
3. `POST /api/v1/reflections` with `avoid_strategy: 'broad-web-search'` → 断言响应包含 `reflection.id` 且 `policy.avoid_strategies` 包含 `'broad-web-search'`
4. `GET /api/v1/policies/current?goal_id=...` → 断言 `avoid_strategies` 包含 `'broad-web-search'`，`must_check_before_retry` 非空
5. `POST /api/v1/retry-guard/check` with same `strategy_tags: ['broad-web-search']` → 断言 `allowed === false`, `reason === 'blocked_strategy_overlap'`, `tag_overlap_rate > 0.6`
6. `POST /api/v1/retry-guard/check` with `strategy_tags: ['academic_db', 'domain_specific']` and `policy_acknowledged: true`, `what_changed: 'Switching to academic databases'` → 断言 `allowed === true`
7. `GET /api/v1/recovery-packet?goal_id=...` → 断言 `avoid_strategies` 包含 `'broad-web-search'`，`last_failure_summary` 非空，`success_criteria` 与创建时一致

- [ ] **Step 2: Run test to confirm failure**

Run: `cd service && pnpm test -- test/integration.behavior-loop.test.ts`

Expected: FAIL until all previous layers are wired.

- [ ] **Step 3: Wire missing pieces minimally**

Goal:

- no new features
- only fill integration gaps

- [ ] **Step 4: Run integration test**

Run: `cd service && pnpm test -- test/integration.behavior-loop.test.ts`

Expected: PASS

---

## Task 8: Implement Agent Adapter After Service Is Green

**Files:**

- Create: `agent-adapter/package.json`
- Create: `agent-adapter/tsconfig.json`
- Create: `agent-adapter/src/config.ts`
- Create: `agent-adapter/src/client.ts`
- Create: `agent-adapter/src/tools/goal-get-current.ts`
- Create: `agent-adapter/src/tools/attempt-append.ts`
- Create: `agent-adapter/src/tools/reflection-generate.ts`
- Create: `agent-adapter/src/tools/policy-get-current.ts`
- Create: `agent-adapter/src/tools/retry-guard-check.ts`
- Create: `agent-adapter/src/tools/recovery-packet-get.ts`
- Create: `agent-adapter/src/index.ts`
- Create: `agent-adapter/test/tools.test.ts`

- [ ] **Step 1: Write failing adapter tests**

Test cases:

- maps snake_case responses to camelCase
- serializes camelCase requests to snake_case
- preserves `allowed = false` as business result
- exposes local `reflection_generate` helper without service dependency
- normalizes `404 / 409 / 422 / 500` errors

- [ ] **Step 2: Run tests to confirm failure**

Run: `cd agent-adapter && pnpm test`

Expected: FAIL because adapter files do not exist yet.

- [ ] **Step 3: Implement adapter client and tools minimally**

Rules:

- one central mapper for naming conversion
- no business logic duplication from service
- `reflection_generate` stays local helper in v0

- [ ] **Step 4: Run adapter tests**

Run: `cd agent-adapter && pnpm test`

Expected: PASS

---

## Task 9: Add Projection Helpers and Projection Consistency Tests

**Files:**

- Create: `examples/workspace/goal-engine/projection-writer.ts`
- Create: `examples/workspace/goal-engine/current-goal.md`
- Create: `examples/workspace/goal-engine/current-policy.md`
- Create: `examples/workspace/goal-engine/recovery-packet.md`

- [ ] **Step 1: Write failing projection consistency tests or fixtures**

Assertions:

- projection contains only summary fields
- projection excludes full attempts/reflections history
- new session can rebuild projection from `recovery_packet_get + policy_get_current`
- projection refresh runs after policy update
- projection refresh runs on session start
- one writer/helper owns file refresh so templates and refresh logic cannot drift

- [ ] **Step 2: Implement projection writer/helper and templates**

Rules:

- summaries only
- service remains source of truth
- no extra hidden state in local files
- refresh sources:
  - after policy update
  - after recovery packet fetch
  - on new session rebuild

- [ ] **Step 3: Verify projection examples**

Run: `rg -n "attempt_|reflection_|history" examples/workspace/goal-engine`

Expected: no full-history leakage

---

## Task 10: Final Verification

**Files:**

- Verify all files above

- [ ] **Step 1: Run service tests**

Run: `cd service && pnpm test`

Expected: PASS

- [ ] **Step 2: Run adapter tests**

Run: `cd agent-adapter && pnpm test`

Expected: PASS

- [ ] **Step 3: Review against baseline**

Checklist:

- `failure_type` enum matches baseline
- `reflection_generate` remains adapter-local in v0
- `retry_guard` uses frozen reasons
- `recovery packet` remains derived
- local projection remains summary-only

- [ ] **Step 4: Optional commit checkpoint**

```bash
git add service agent-adapter examples/workspace/goal-engine docs
git commit -m "feat(goal-engine): implement v0 behavior change loop"
```

---

## Execution Notes

- Do not implement `POST /api/v1/reflections/generate` in the first pass.
- Do not add UI or dashboard work into this plan.
- Do not replace guard heuristics with model-based similarity.
- If any test is hard to write because semantics are unclear, update the docs first.

---

## Definition of Done

Goal Engine v0 is done when all of the following are true:

- failing attempts create structured history
- reflections update current policy synchronously
- retry guard blocks same-path retries explicitly
- changed strategy can pass guard
- recovery packet restores minimum actionable context
- adapter exposes stable tools
- local projection remains a projection, not a database

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | 12 plan issues surfaced in independent cold read |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 2 | ISSUES_OPEN | 6 issues, 1 critical gap |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |

- **CODEX:** Flagged missing mandatory endpoints, missing reflection atomicity guarantee, vague retry-guard semantics, weak recovery source-of-truth, incomplete route error tests, fake projection integration, adapter `500` gap, shared-type drift, low-value TDD ceremony, and missing bootstrap prerequisites.
- **CROSS-MODEL:** Codex findings substantially overlapped with the eng review; both converged on contract completeness, exact guard semantics, recovery derivation, and projection realism.
- **UNRESOLVED:** 1 decision remains explicitly unresolved in the accepted plan: non-transactional `POST /api/v1/reflections` consistency risk.
- **VERDICT:** ENG REVIEW NOT CLEARED — plan is materially stronger after review edits, but the accepted non-transactional reflection flow remains a critical architecture concern.
