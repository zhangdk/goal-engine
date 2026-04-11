# Goal Engine OpenClaw User Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让会安装 OpenClaw、但不想自己接 API 和手写配置的用户，可以通过 OpenClaw 显式入口体验 Goal Engine 的长期目标闭环。

**Architecture:** 继续保持 `service` 作为唯一事实源；把 `agent-adapter` 从“代码层 helper”升级成“OpenClaw 集成底座”；新增一层明确的 OpenClaw 用户入口与 session 恢复流程；projection 继续只保存摘要，不承载事实。第一版只做显式入口和恢复闭环，不追求全自动 hook 接管。

**Tech Stack:** TypeScript, Hono, SQLite, OpenClaw local integration, markdown projections, Vitest, Playwright

---

## Scope Guard

本计划覆盖：

- OpenClaw 内显式 Goal Engine 入口
- 单 active goal 的用户体验闭环
- projection 自动刷新
- session 重启后恢复
- 面向 OpenClaw 高级用户的安装与使用文档

本计划不覆盖：

- 独立 Web UI 主入口
- 面向普通大众的新手安装器
- 完全自动失败识别
- 全自动 hook 接管所有 agent 行为
- 多目标并行
- 多 agent 协作

---

## File Map

### Docs

**Create:**

- `docs/superpowers/specs/2026-04-04-goal-engine-openclaw-user-experience-design.md`
- `docs/goal-engine-openclaw-quickstart.md`
- `docs/goal-engine-openclaw-user-guide.md`

**Modify:**

- `README.md`
- `docs/README.md`
- `docs/goal-engine-v0-openclaw-integration.md`
- `docs/goal-engine-v0-api-contract.md`

### Adapter / Integration

**Create:**

- `agent-adapter/src/projections/refresh-projections.ts`
- `agent-adapter/src/projections/load-projection-state.ts`
- `agent-adapter/src/workflows/start-goal-session.ts`
- `agent-adapter/src/workflows/record-failure-and-refresh.ts`
- `agent-adapter/src/workflows/recover-goal-session.ts`
- `agent-adapter/src/workflows/check-retry-and-explain.ts`
- `agent-adapter/test/projections.test.ts`
- `agent-adapter/test/workflows.test.ts`
- `openclaw/README.md`
- `openclaw/goal-engine-entrypoints.md`
- `openclaw/workspace/goal-engine/README.md`

**Modify:**

- `agent-adapter/src/index.ts`
- `agent-adapter/src/client.ts`
- `agent-adapter/src/tools/goal-get-current.ts`
- `agent-adapter/src/tools/attempt-append.ts`
- `agent-adapter/src/tools/reflection-generate.ts`
- `agent-adapter/src/tools/policy-get-current.ts`
- `agent-adapter/src/tools/retry-guard-check.ts`
- `agent-adapter/src/tools/recovery-packet-get.ts`
- `agent-adapter/test/tools.test.ts`

### Projection

**Modify:**

- `examples/workspace/goal-engine/projection-writer.ts`
- `examples/workspace/goal-engine/current-goal.md`
- `examples/workspace/goal-engine/current-policy.md`
- `examples/workspace/goal-engine/recovery-packet.md`
- `.openclaw/workspace-state.json`
- `service/test/projection.test.ts`

### End-to-End Validation

**Create:**

- `service/e2e/openclaw-user-experience.spec.ts`
- `docs/checklists/goal-engine-openclaw-acceptance.md`

---

## Task 1: Lock User-Facing Contract

**Files:**

- Create: `docs/superpowers/specs/2026-04-04-goal-engine-openclaw-user-experience-design.md`
- Modify: `docs/goal-engine-v0-openclaw-integration.md`
- Modify: `docs/goal-engine-v0-api-contract.md`

- [ ] **Step 1: Write the user-facing command/entrypoint list**

Required first-pass entrypoints:

- `start goal`
- `show goal status`
- `record failed attempt`
- `recover current goal`
- `check retry`

- [ ] **Step 2: Define exact input/output envelopes**

For each entrypoint, write:

- minimum required user input
- success response
- empty-state response
- recoverable error response

- [ ] **Step 3: Replace internal terms with user-facing language**

Map:

- `retry_guard` -> “retry check” / “重复尝试检查”
- `recovery_packet` -> “recovery summary” / “恢复摘要”
- `policy` -> “current guidance” / “当前策略建议”

- [ ] **Step 4: Record 4 canonical user flows**

Must include:

1. create first goal
2. inspect current status
3. record one failed attempt and update guidance
4. restart session and recover

- [ ] **Step 5: Save and review contract before code work**

Run:

- `sed -n '1,220p' docs/superpowers/specs/2026-04-04-goal-engine-openclaw-user-experience-design.md`

Expected:

- contract language is user-facing
- entrypoints are stable
- no hidden requirement for direct API usage

---

## Task 2: Add Adapter Projection APIs

**Files:**

- Create: `agent-adapter/src/projections/refresh-projections.ts`
- Create: `agent-adapter/src/projections/load-projection-state.ts`
- Create: `agent-adapter/test/projections.test.ts`
- Modify: `agent-adapter/src/index.ts`
- Modify: `examples/workspace/goal-engine/projection-writer.ts`

- [ ] **Step 1: Write failing tests for projection refresh orchestration**

Cover:

- refresh from `recoveryPacketGet + policyGetCurrent`
- no active policy still writes stable projection files
- refresh failure returns stable adapter error

- [ ] **Step 2: Implement minimal projection refresh wrapper**

Behavior:

- fetch recovery packet
- fetch policy if available
- call `writeProjections`
- return refresh summary

- [ ] **Step 3: Implement projection state loader**

Behavior:

- read existing projection files if they exist
- return parsed lightweight status for session bootstrap
- never treat local files as source of truth

- [ ] **Step 4: Re-export the new APIs from adapter entrypoint**

Run:

- `cd agent-adapter && pnpm test -- projections`

Expected:

- projection orchestration tests pass

---

## Task 3: Build User Workflows on Top of Tools

**Files:**

- Create: `agent-adapter/src/workflows/start-goal-session.ts`
- Create: `agent-adapter/src/workflows/record-failure-and-refresh.ts`
- Create: `agent-adapter/src/workflows/recover-goal-session.ts`
- Create: `agent-adapter/src/workflows/check-retry-and-explain.ts`
- Create: `agent-adapter/test/workflows.test.ts`
- Modify: `agent-adapter/src/index.ts`

- [ ] **Step 1: Write failing tests for the four user workflows**

Cover:

- start goal -> create goal -> refresh projection
- record failure -> append attempt -> generate reflection -> post reflection -> refresh projection
- recover -> pull recovery packet -> produce concise summary
- retry check -> call guard -> translate reason into user-facing wording

- [ ] **Step 2: Implement `startGoalSession`**

Behavior:

- create goal
- refresh projections
- return compact “goal started” response

- [ ] **Step 3: Implement `recordFailureAndRefresh`**

Behavior:

- append failed attempt
- locally generate reflection draft
- persist reflection
- refresh projections
- return updated guidance summary

- [ ] **Step 4: Implement `recoverGoalSession`**

Behavior:

- fetch recovery packet
- fetch current policy when present
- format restart-safe summary

- [ ] **Step 5: Implement `checkRetryAndExplain`**

Behavior:

- call retry guard
- translate block reason into human explanation
- preserve raw reason code for debugging

- [ ] **Step 6: Verify workflow tests**

Run:

- `cd agent-adapter && pnpm test -- workflows`

Expected:

- all four workflows pass
- user-facing strings do not expose raw API contract terms by default

---

## Task 4: Harden Adapter Errors for User Consumption

**Files:**

- Modify: `agent-adapter/src/client.ts`
- Modify: `agent-adapter/src/tools/*.ts`
- Modify: `agent-adapter/test/tools.test.ts`

- [ ] **Step 1: Write failing tests for user-relevant errors**

Cover:

- no active goal
- no policy yet
- goal not found
- validation failure
- service unavailable

- [ ] **Step 2: Normalize raw service failures**

Rules:

- preserve machine-readable code
- provide short user-facing message
- avoid leaking HTTP internals in primary text

- [ ] **Step 3: Verify tool-level behavior remains backward compatible**

Run:

- `cd agent-adapter && pnpm test -- tools`

Expected:

- existing tool tests still pass
- new errors are stable

---

## Task 5: Define OpenClaw Entry Surface

**Files:**

- Create: `openclaw/README.md`
- Create: `openclaw/goal-engine-entrypoints.md`
- Create: `openclaw/workspace/goal-engine/README.md`
- Modify: `.openclaw/workspace-state.json`

- [ ] **Step 1: Decide concrete OpenClaw packaging shape**

Document whether first pass uses:

- plugin tool wrappers
- workspace command docs
- agent bootstrap docs

The first version must be explicit and debuggable.

- [ ] **Step 2: Specify how OpenClaw should expose the five entrypoints**

For each entrypoint, record:

- user trigger phrase or command
- adapter workflow invoked
- projection files read or refreshed

- [ ] **Step 3: Define session bootstrap behavior**

Must state:

- when to read projection
- when to call recovery workflow
- what to show when there is no active goal

- [ ] **Step 4: Add local notes for workspace integration**

Run:

- `sed -n '1,220p' openclaw/goal-engine-entrypoints.md`

Expected:

- integration instructions are specific enough to implement without rereading PRD

---

## Task 6: Wire Projection Refresh Triggers

**Files:**

- Modify: `examples/workspace/goal-engine/projection-writer.ts`
- Modify: `service/test/projection.test.ts`
- Modify: workflow files from Task 3

- [ ] **Step 1: Write failing tests for refresh trigger coverage**

Cover:

- after goal creation
- after reflection write
- during recovery

- [ ] **Step 2: Implement consistent refresh trigger calls**

Rules:

- refresh happens in adapter workflow layer
- refresh does not mutate service state
- refresh failure is surfaced but does not silently corrupt state

- [ ] **Step 3: Add regression test for summary-only projection**

Run:

- `cd service && pnpm test -- projection`
- `cd agent-adapter && pnpm test -- projections workflows`

Expected:

- projection remains summary-only
- refresh triggers are deterministic

---

## Task 7: Add OpenClaw-Oriented E2E Validation

**Files:**

- Create: `service/e2e/openclaw-user-experience.spec.ts`
- Create: `docs/checklists/goal-engine-openclaw-acceptance.md`
- Modify: `service/playwright.config.ts` if needed

- [ ] **Step 1: Write the failing end-to-end scenario**

Scenario:

1. start goal
2. inspect status
3. record one failed attempt
4. check retry and get blocked
5. recover in a fresh session context

- [ ] **Step 2: Implement test helpers or fixtures minimally**

Rules:

- prefer reusing adapter workflows
- avoid duplicating API payload construction

- [ ] **Step 3: Add acceptance checklist for manual validation**

Checklist must prove:

- no direct API knowledge required
- a user can finish setup in 15 to 30 minutes
- restart recovery actually works

- [ ] **Step 4: Run end-to-end verification**

Run:

- `cd service && pnpm test:e2e`

Expected:

- OpenClaw-oriented user journey passes

---

## Task 8: Write User Docs and Quickstart

**Files:**

- Modify: `README.md`
- Modify: `docs/README.md`
- Create: `docs/goal-engine-openclaw-quickstart.md`
- Create: `docs/goal-engine-openclaw-user-guide.md`

- [ ] **Step 1: Write the quickstart for target user B**

Must answer:

- what this is
- who it is for
- what they need installed
- how to start the service
- how to use Goal Engine from OpenClaw

- [ ] **Step 2: Write the user guide around the four core flows**

Flows:

- start a goal
- check status
- record a failure
- recover next session

- [ ] **Step 3: Update the root README positioning**

Must clarify:

- current stage
- what is now user-testable
- what still remains deferred

- [ ] **Step 4: Verify docs against real commands**

Run:

- `rg -n "localhost:3100|Goal Engine|OpenClaw" README.md docs openclaw -S`

Expected:

- docs are aligned with actual command names and files

---

## Task 9: Final Verification and Ship Gate

**Files:**

- Modify: any touched files above

- [ ] **Step 1: Run typecheck and unit tests**

Run:

- `cd service && pnpm exec tsc --noEmit && pnpm test`
- `cd agent-adapter && pnpm exec tsc --noEmit && pnpm test`

Expected:

- all tests pass
- no type errors

- [ ] **Step 2: Run e2e and manual acceptance**

Run:

- `cd service && pnpm test:e2e`

Manual:

- follow `docs/checklists/goal-engine-openclaw-acceptance.md`

- [ ] **Step 3: Validate the milestone statement**

The build only counts as done if this sentence is true:

“一个会安装 OpenClaw、但不想自己接插件和写 API 的用户，可以在 15 到 30 分钟内完成接入，并成功跑通一次长期目标创建、失败写回、状态恢复的闭环。”

---

## Milestones

- `M1`: Stable user-facing contract and adapter projection APIs
- `M2`: User workflows implemented and testable
- `M3`: OpenClaw entry surface and recovery flow wired
- `M4`: Docs, e2e, and acceptance checklist complete

## Risks to Watch

- OpenClaw integration shape may be under-specified in this repo; avoid blocking early milestones on perfect runtime automation
- projection files are easy to over-expand into history storage; keep them summary-only
- adapter layer must not absorb business rules that belong in service
- user-facing naming drift will create a split brain between docs and runtime
