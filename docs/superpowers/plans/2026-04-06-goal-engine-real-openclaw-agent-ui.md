# Goal Engine Real OpenClaw Agent UI Implementation Plan

**Goal:** 把 `/ui` 的主实体改成真实托管的 OpenClaw Agent，而不是 `active goal context`。第一版使用 `.openclaw/workspace-state.json` 中的 `managedAgents` 作为真实 Agent 绑定源。

**Architecture:** 继续保持 `service` 为唯一事实源，不新增数据库表。新增一层 `managed OpenClaw agent binding` 读取逻辑，来源是 `.openclaw/workspace-state.json`。Gallery 和 Detail 先以 `managed agent + current active goal facts` 组成页面数据。

**Tech Stack:** TypeScript, Hono, SQLite, inline HTML/CSS/JS, Vitest, Playwright

## Scope

覆盖：

- 真实托管 OpenClaw Agent 列表
- Agent 详情页
- workspace-state 绑定读取
- 当前 active goal 挂载
- 相关测试和文档

不覆盖：

- OpenClaw runtime registry API
- 多 active goal 并发模型
- agent 历史归档表

## Files

### Create

- `service/src/ui/managed-openclaw-agents.ts`
  - 读取 `.openclaw/workspace-state.json`
  - 返回 `managedAgents`

### Modify

- `.openclaw/workspace-state.json`
  - 增加 `managedAgents`
- `service/src/routes/ui.ts`
  - 主实体切换为真实 OpenClaw Agent
- `service/src/ui/agent-gallery.ts`
  - 用 `managedAgents` 构造卡片
- `service/src/ui/agent-detail.ts`
  - 用 `agentId` 查找真实 Agent，再挂载当前 goal facts
- `service/test/routes.ui-agents.test.ts`
- `service/e2e/agent-evolution-ui.spec.ts`
- `README.md`
- `docs/README.md`

## Task 1: Add real managed-agent binding source

- [ ] 在 `.openclaw/workspace-state.json` 中增加 `goalEngine.managedAgents`
- [ ] 新增读取模块 `service/src/ui/managed-openclaw-agents.ts`
- [ ] 给读取逻辑补单测或在 route test 中覆盖

## Task 2: Switch gallery to real OpenClaw agents

- [ ] 先写 failing tests：gallery card title 必须是 `goal-engine-demo` 这类真实 Agent 名称
- [ ] `agentId` 改成真实 OpenClaw `agentId`
- [ ] 卡片展示 `workspace` / `session` / `managed`

## Task 3: Switch detail to real OpenClaw agents

- [ ] 先写 failing tests：detail header 必须是 Agent 名称，不是 goal 标题
- [ ] 详情页增加 `Managed Status`
- [ ] 当前 goal 作为附属状态，而不是 header 主实体

## Task 4: Keep goal history attached under the real agent

- [ ] 复用现有 goal/attempt/reflection/policy/recovery 聚合
- [ ] 但所有这些内容都挂在真实 Agent 详情下面
- [ ] 如果当前没有 active goal，要显示“该 Agent 当前未被挂上 active goal”

## Task 5: Verification

- [ ] `pnpm exec tsc --noEmit`
- [ ] `pnpm test`
- [ ] `pnpm test:e2e`
- [ ] 浏览器 E2E 断言：
  - 首页看到 `goal-engine-demo`
  - 详情页主标题看到 `goal-engine-demo`
  - 当前 goal 仍然可见
  - timeline 仍然可见

## Success Line

当用户打开 `/ui` 时，必须先看到**真实托管的 OpenClaw Agent**。  
如果看到的仍然是 goal title 在扮演主实体，就说明实现没有达标。
