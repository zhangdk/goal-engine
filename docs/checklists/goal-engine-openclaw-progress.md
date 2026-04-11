# Goal Engine OpenClaw Progress Audit

**Date:** 2026-04-06

## Audit Scope

本清单按“OpenClaw 普通高级用户可体验”这条需求线核对当前边界和完成度。

目标用户不是普通大众用户，目标也不是独立 UI 产品。

## Requirement Status

### 1. OpenClaw 内显式 Goal Engine 入口

状态：**DONE**

证据：

- `openclaw/goal-engine-entrypoints.md`
- `openclaw/commands.json`
- `agent-adapter/src/openclaw/dispatch-entrypoint.ts`
- `agent-adapter/src/openclaw/cli.ts`
- `agent-adapter/test/openclaw.test.ts`
- `agent-adapter/test/openclaw-cli.test.ts`

### 2. 单 active goal 的用户体验闭环

状态：**DONE**

证据：

- `start goal`
- `show goal status`
- `record failed attempt`
- `check retry`
- `recover current goal`
- `service/e2e/openclaw-user-experience.spec.ts`

边界：

- 仍然只支持单 active goal
- 多目标并行仍未开始

### 3. Projection 自动刷新

状态：**DONE**

证据：

- `agent-adapter/src/projections/refresh-projections.ts`
- `agent-adapter/src/workflows/start-goal-session.ts`
- `agent-adapter/src/workflows/record-failure-and-refresh.ts`
- `agent-adapter/src/workflows/recover-goal-session.ts`
- `agent-adapter/test/projections.test.ts`
- `agent-adapter/test/workflows.test.ts`

### 4. Session 重启后恢复

状态：**DONE**

证据：

- `agent-adapter/src/openclaw/bootstrap-session.ts`
- `.openclaw/workspace-state.json`
- `agent-adapter/test/openclaw.test.ts`

边界：

- 当前是 bootstrap + explicit recover
- 还不是自动 hook 接管

### 5. 面向 OpenClaw 高级用户的安装与使用文档

状态：**DONE**

证据：

- `README.md`
- `docs/README.md`
- `docs/goal-engine-openclaw-quickstart.md`
- `docs/goal-engine-openclaw-user-guide.md`
- `docs/checklists/goal-engine-openclaw-acceptance.md`

### 6. 真实运行验证

状态：**DONE**

证据：

- `cd agent-adapter && pnpm test`
- `cd service && pnpm exec tsc --noEmit`
- `cd service && pnpm test`
- `cd service && pnpm test:e2e`
- `openclaw plugins inspect goal-engine`
- `docs/checklists/goal-engine-openclaw-lifecycle-smoke.md`

### 7. 真正的 OpenClaw runtime/plugin/hook wiring

状态：**PARTIAL**

已完成：

- CLI surface
- bootstrap logic
- machine-readable command map
- workspace-state bootstrap defaults
- 本地 OpenClaw 插件发现/加载
- `boot-md` 与 `bootstrap-extra-files` 接线
- 真实 plugin inspect + lifecycle smoke 验证

未完成：

- 自动执行 `goal_engine_bootstrap`
- retry / failure 的稳定语义 hook
- 更完整的无感知自动化策略

技术判断：

- OpenClaw 内置 internal hooks 只有 `boot-md`、`bootstrap-extra-files`、`command-logger`、`session-memory`
- OpenClaw plugin SDK 额外提供 `before_tool_call`、`after_tool_call`、`before_dispatch`、`before_agent_start`、`agent_end` 等 plugin hooks
- 但这些 plugin hook 缺少 Goal Engine retry / failure 自动化所需的稳定业务语义
- 因此当前缺口不是“完全没有 hook”，而是“没有足够语义化的 hook”

### 8. 面向普通用户的产品化体验

状态：**NOT STARTED**

明确不在当前边界内：

- UI dashboard 作为主入口
- 面向普通大众的安装器
- 无 OpenClaw 前置知识的体验

## Current Boundary Call

当前最准确的边界判断是：

- **不是** 普通用户产品
- **不是** 只有 API 的开发者原型
- **是** 一个面向 OpenClaw 高级用户、已经具备显式入口、恢复闭环和验证覆盖的可体验骨架

## What Is Actually Missing Now

剩余最大缺口不是 service，也不是 adapter workflow。

剩余最大缺口是：

1. 决定是否以及如何自动执行 `goal_engine_bootstrap`
2. 评估 retry / failure 是否存在稳定 hook 点
3. 决定是否继续保持显式入口，还是逐步变成更强的无感知自动化

## Recommendation

下一阶段不要再扩产品边界。

应该只做这一件事：

**继续收敛自动 lifecycle wiring，尤其是 `goal_engine_bootstrap`、retry guard、failure writeback 的自动化边界。**
