# Goal Engine Agent Evolution UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构当前 `/ui`，把“系统状态板”改成用户可理解的 Agent 学习经历界面，支持 `Agent Gallery -> Agent Detail`，并让用户先看到结论、再看状态、再看时间线证据。

**Architecture:** 继续保持 `service` 为唯一事实源，不新增数据库表，不重做独立前端工程。新的 UI 以两个聚合接口为核心：一个用于 Agent Gallery，一个用于 Agent Detail；前端用轻量 HTML/CSS/JS 页面消费这两个接口，并复用现有 mutation API 执行动作。第一版允许把 “agent” 视为一个可观察的 goal/session context，而不是完整 agent domain model。

**Tech Stack:** TypeScript, Hono, SQLite, inline HTML/CSS/JS, Vitest, Playwright

---

## Scope Guard

本计划覆盖：

- `Agent Gallery` 首页
- `Agent Detail` 详情页
- `Learning Verdict`
- `Current State`
- `Evolution Timeline`
- `System Gaps`
- 对应的 gallery/detail 聚合接口
- 浏览器 E2E

本计划不覆盖：

- 独立前端工程
- OpenClaw 内嵌页
- 真正的 agent identity schema 重构
- persisted retry-check history
- persisted recovery-event history
- 趋势图表与评分系统

---

## File Structure

### Create

- `service/src/ui/agent-gallery.ts`
  - 聚合首页卡片数据
- `service/src/ui/agent-detail.ts`
  - 聚合详情页 header / verdict / current state / timeline / gaps
- `service/src/ui/verdict.ts`
  - verdict 判定规则
- `service/src/ui/timeline.ts`
  - 将 attempts / reflections / policy / recovery 映射成统一时间线事件
- `service/test/routes.ui-agents.test.ts`
  - gallery/detail 接口测试
- `service/e2e/agent-evolution-ui.spec.ts`
  - 浏览器 E2E

### Modify

- `service/src/routes/ui.ts`
  - 从单页 observability 改为 gallery/detail 路由和页面壳
- `service/src/app.ts`
  - 继续挂载 UI 路由
- `README.md`
- `docs/README.md`

### Reuse, do not expand

- `service/src/repos/goal.repo.ts`
- `service/src/repos/attempt.repo.ts`
- `service/src/repos/reflection.repo.ts`
- `service/src/repos/policy.repo.ts`
- `service/src/services/recovery.service.ts`
- 现有 mutation 路由：
  - `/api/v1/goals`
  - `/api/v1/attempts`
  - `/api/v1/reflections`
  - `/api/v1/retry-guard/check`
  - `/api/v1/recovery-packet`

---

## Task 1: Replace The UI Data Model

**Files:**
- Create: `service/src/ui/verdict.ts`
- Create: `service/src/ui/timeline.ts`
- Create: `service/src/ui/agent-gallery.ts`
- Create: `service/src/ui/agent-detail.ts`
- Test: `service/test/routes.ui-agents.test.ts`

- [ ] **Step 1: Write failing tests for the new UI payload shape**

Cover:

- gallery returns a list of observable agents
- detail returns `header`, `learningVerdict`, `currentState`, `timeline`, `systemGaps`
- detail can represent `No evidence yet`, `Partial improvement`, `Clear improvement`, `Stalled`

- [ ] **Step 2: Run the new test file and verify it fails**

Run:

```bash
cd service && pnpm test -- routes.ui-agents.test.ts
```

Expected:

- FAIL because new gallery/detail route contract does not exist yet

- [ ] **Step 3: Implement verdict rules in `service/src/ui/verdict.ts`**

Support:

- `none`
- `partial`
- `clear`
- `stalled`

Each verdict must return:

- `level`
- `label`
- `reason`
- `evidenceEventIds`

- [ ] **Step 4: Implement timeline normalization in `service/src/ui/timeline.ts`**

Supported event types:

- `failure`
- `reflection`
- `policy_update`
- `retry_check`
- `recovery`
- `progress`

Each event must return:

- `id`
- `timestamp`
- `type`
- `title`
- `summary`
- `impact`
- `linkedIds`

- [ ] **Step 5: Implement gallery aggregation in `service/src/ui/agent-gallery.ts`**

Return per card:

- `agentId`
- `name`
- `currentGoal`
- `learningVerdict`
- `lastActiveAt`
- `recentChangeSummary`

Implementation note:

- first version may derive `agentId` from observable goal/session context
- do not add a new DB entity

- [ ] **Step 6: Implement detail aggregation in `service/src/ui/agent-detail.ts`**

Return:

- `header`
- `learningVerdict`
- `currentState`
- `timeline`
- `systemGaps`

- [ ] **Step 7: Re-run tests**

Run:

```bash
cd service && pnpm test -- routes.ui-agents.test.ts
```

Expected:

- PASS

---

## Task 2: Replace `/ui` With Gallery + Detail

**Files:**
- Modify: `service/src/routes/ui.ts`
- Modify: `service/src/app.ts`
- Test: `service/test/routes.ui-agents.test.ts`

- [ ] **Step 1: Write failing route assertions for the new endpoints**

Add tests for:

- `GET /api/v1/ui/agents`
- `GET /api/v1/ui/agents/:agentId`
- `GET /ui`
- `GET /ui/agents/:agentId`

- [ ] **Step 2: Run tests and confirm route failures**

Run:

```bash
cd service && pnpm test -- routes.ui-agents.test.ts
```

Expected:

- FAIL on missing routes or shape mismatch

- [ ] **Step 3: Replace the single observability route with gallery/detail API routes**

Required API surface:

- `GET /api/v1/ui/agents`
- `GET /api/v1/ui/agents/:agentId`

Required HTML routes:

- `GET /ui`
- `GET /ui/agents/:agentId`

- [ ] **Step 4: Keep existing `/ui` alive as the gallery entrypoint**

Do not break:

- local product demos
- existing `/ui` bookmarks

- [ ] **Step 5: Re-run tests**

Run:

```bash
cd service && pnpm test -- routes.ui-agents.test.ts
```

Expected:

- PASS

---

## Task 3: Build The Agent Gallery UI

**Files:**
- Modify: `service/src/routes/ui.ts`
- Test: `service/e2e/agent-evolution-ui.spec.ts`

- [ ] **Step 1: Write failing browser test for gallery**

Assert:

- page title loads
- at least one agent card is visible when data exists
- each card shows:
  - agent name
  - current goal
  - learning verdict
  - last active
  - recent change

- [ ] **Step 2: Run the browser test and verify failure**

Run:

```bash
cd service && pnpm exec playwright test e2e/agent-evolution-ui.spec.ts
```

Expected:

- FAIL because old `/ui` layout is still rendered

- [ ] **Step 3: Implement gallery layout**

Requirements:

- lightweight card layout
- optional filter chips:
  - all
  - improving
  - stalled
  - needs review
- each card links to `/ui/agents/:agentId`

- [ ] **Step 4: Keep user-facing language non-technical**

Do not show:

- `policy`
- `retry_guard`
- `recovery_packet`
- raw audit state on cards

- [ ] **Step 5: Re-run the browser test**

Run:

```bash
cd service && pnpm exec playwright test e2e/agent-evolution-ui.spec.ts
```

Expected:

- gallery assertions pass

---

## Task 4: Build The Agent Detail UI

**Files:**
- Modify: `service/src/routes/ui.ts`
- Test: `service/e2e/agent-evolution-ui.spec.ts`

- [ ] **Step 1: Extend the failing browser test for detail view**

Assert the detail page shows:

- header
- learning verdict cards
- current state
- evolution timeline
- system gaps

- [ ] **Step 2: Run the browser test and confirm detail failure**

Run:

```bash
cd service && pnpm exec playwright test e2e/agent-evolution-ui.spec.ts
```

Expected:

- FAIL on missing detail layout or wrong content order

- [ ] **Step 3: Implement the header**

Must show:

- agent name
- current goal
- current status
- last active time
- back to gallery

- [ ] **Step 4: Implement `Learning Verdict` as the top section**

Must show:

- `Behavior Changed`
- `Repeat Errors Reduced`
- `Memory Preserved`

Each card must include:

- result
- one-sentence reason
- evidence hook or linked event id summary

- [ ] **Step 5: Implement `Current State`**

Must show:

- current goal
- stage
- current strategy/guidance
- avoid strategies
- recommended next step
- current blockers if any

- [ ] **Step 6: Implement `Evolution Timeline`**

Must render unified event cards in reverse chronological order

- [ ] **Step 7: Move `System Gaps` to the bottom**

Display:

- retry-check history not persisted
- recovery-event history not persisted
- OpenClaw-native UI missing

- [ ] **Step 8: Re-run the browser test**

Run:

```bash
cd service && pnpm exec playwright test e2e/agent-evolution-ui.spec.ts
```

Expected:

- detail assertions pass

---

## Task 5: Wire Existing Actions Into The New Detail Page

**Files:**
- Modify: `service/src/routes/ui.ts`
- Test: `service/e2e/agent-evolution-ui.spec.ts`

- [ ] **Step 1: Write failing E2E assertions for actions inside detail**

Cover:

- `Start Goal`
- `Record Failure`
- `Check Retry`
- `Recover`

- [ ] **Step 2: Run browser tests and confirm failure**

Run:

```bash
cd service && pnpm exec playwright test e2e/agent-evolution-ui.spec.ts
```

Expected:

- FAIL because the new detail page does not yet update its sections

- [ ] **Step 3: Reuse current mutation APIs from the detail page**

Map:

- `Start Goal` -> `POST /api/v1/goals`
- `Record Failure` -> `POST /api/v1/attempts` then `POST /api/v1/reflections`
- `Check Retry` -> `POST /api/v1/retry-guard/check`
- `Recover` -> refetch detail payload

- [ ] **Step 4: Add explicit error handling for two-stage failure recording**

If attempt succeeds and reflection fails, page must show:

- attempt recorded
- reflection failed
- state may be incomplete

- [ ] **Step 5: Refetch detail payload after each successful action**

The page must visibly update:

- verdict
- current state
- timeline
- gaps when relevant

- [ ] **Step 6: Re-run browser tests**

Run:

```bash
cd service && pnpm exec playwright test e2e/agent-evolution-ui.spec.ts
```

Expected:

- PASS

---

## Task 6: Preserve Product Honesty

**Files:**
- Modify: `service/src/ui/verdict.ts`
- Modify: `service/src/ui/agent-detail.ts`
- Test: `service/test/routes.ui-agents.test.ts`

- [ ] **Step 1: Write failing tests for honesty constraints**

Assert:

- no fake retry history event is fabricated
- no fake recovery history event is fabricated
- missing system capabilities remain visible in detail

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
cd service && pnpm test -- routes.ui-agents.test.ts
```

Expected:

- FAIL on missing honesty assertions

- [ ] **Step 3: Implement honesty rules**

Rules:

- `retry_check` may appear as current evidence only if it happened in-page
- recovery may be shown as current snapshot, not replay history
- verdict may not claim `clear improvement` without evidence chain support

- [ ] **Step 4: Re-run tests**

Run:

```bash
cd service && pnpm test -- routes.ui-agents.test.ts
```

Expected:

- PASS

---

## Task 7: Documentation Sync

**Files:**
- Modify: `README.md`
- Modify: `docs/README.md`

- [ ] **Step 1: Update product description of `/ui`**

Document that `/ui` is now:

- agent gallery
- agent detail
- verdict + timeline UI

- [ ] **Step 2: Remove stale language that describes `/ui` as only a system observability board**

- [ ] **Step 3: Add the new redesign spec to the recommended reading list**

- [ ] **Step 4: Review docs for consistency**

Run:

```bash
sed -n '1,220p' README.md
sed -n '1,220p' docs/README.md
```

Expected:

- terminology matches the redesign

---

## Recommended Commit Sequence

1. `test: add failing ui agents contract tests`
2. `feat: add agent gallery and detail ui aggregators`
3. `feat: replace ui with gallery and detail layout`
4. `feat: wire detail actions into existing goal engine apis`
5. `test: add browser e2e for agent evolution ui`
6. `docs: update ui docs for agent evolution redesign`

---

## Verification Commands

Run all after implementation:

```bash
cd service && pnpm exec tsc --noEmit
cd service && pnpm test -- routes.ui-agents.test.ts
cd service && pnpm exec playwright test e2e/agent-evolution-ui.spec.ts
cd service && pnpm test
cd service && pnpm test:e2e
```

Expected:

- TypeScript passes
- new route tests pass
- new browser E2E passes
- existing service tests stay green

---

## Hand-off Notes

Critical engineering decisions already made:

- do not introduce a new frontend stack
- do not add a new DB model for agent identity in this phase
- do not fabricate evidence to make verdicts look stronger
- do not let system gaps dominate the main reading path

The implementation should optimize for:

- user comprehension first
- explicit evidence second
- product honesty always
