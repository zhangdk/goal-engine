# Goal Engine Real OpenClaw Agent UI Design

**Date:** 2026-04-06

**Supersedes:** `docs/superpowers/specs/2026-04-06-goal-engine-agent-evolution-ui-design.md`

**Goal:** 把 `/ui` 的主实体从伪造的 `goal/session context` 纠正为**真实托管的 OpenClaw Agent**，让用户看到的是 `goal-engine-demo` 这类真实 Agent，再看这个 Agent 被 Goal Engine 接管后的目标、失败、反思、策略和恢复轨迹。

## Product Correction

之前版本把 `active goal` 包装成了 “Agent”。这不符合产品目标。

正确目标是：

- UI 主实体必须是**真实 OpenClaw Agent**
- Goal Engine 的 `goal / attempt / reflection / policy / recovery` 是挂在这个 Agent 下面的托管历史
- 页面回答的是：
  - 我在看哪个真实 Agent
  - 它当前是否被 Goal Engine 接管
  - 它当前托管的 goal 是什么
  - 它在接管期间发生了什么变化

## Primary Entity

第一版主实体定义为：

```text
Managed OpenClaw Agent
  ├── agent_id
  ├── agent_name
  ├── workspace
  ├── session
  ├── managed_by_goal_engine
  └── current_goal_context (optional)
```

说明：

- `agent_id` / `agent_name` 来自 OpenClaw 托管绑定
- `managed_by_goal_engine` 表示是否已经接入 Goal Engine
- `current_goal_context` 是事实挂载，不是主实体

## First-Version Identity Source

当前仓库还没有完整的 OpenClaw runtime registry 接口，因此第一版采用最小真实绑定源：

- `.openclaw/workspace-state.json`

新增约定：

```json
{
  "goalEngine": {
    "managedAgents": [
      {
        "agentId": "goal-engine-demo",
        "agentName": "goal-engine-demo",
        "workspace": "goal-engine",
        "session": "main",
        "managed": true
      }
    ]
  }
}
```

这不是伪造 Agent，而是当前仓库对“哪些真实 OpenClaw Agent 被 Goal Engine 接管”的本地声明源。

边界很明确：

- 第一版不直接查询 OpenClaw 全量 agent registry
- 第一版只展示**被 Goal Engine 托管**的真实 OpenClaw Agent
- 如果 `managedAgents` 里没有条目，UI 就显示“当前没有被 Goal Engine 托管的 OpenClaw Agent”

## Information Architecture

```text
Managed OpenClaw Agent Gallery
  |
  +--> Managed OpenClaw Agent Detail
         |
         +--> Agent Header
         +--> Managed Status
         +--> Current Goal State
         +--> Evolution Timeline
         +--> System Gaps
```

## Gallery

首页展示真实托管 Agent，而不是 goal。

每张卡片显示：

- OpenClaw Agent 名称
- workspace / session
- 当前是否被 Goal Engine 接管
- 当前 goal
- 最近变化摘要
- 最近活跃时间

如果 `managedAgents` 里有多个条目，首页显示多个卡片。

## Detail

详情页主标题必须是 Agent 名称，而不是 goal 标题。

阅读顺序：

1. Agent Header
2. Managed Status
3. Current Goal State
4. Evolution Timeline
5. System Gaps

### Agent Header

显示：

- Agent 名称
- workspace
- session
- 当前托管状态
- 最近活跃时间

### Managed Status

必须明确说明：

- 该 Agent 是否被 Goal Engine 接管
- 当前接管依据是什么

第一版接管依据：

- Agent 出现在 `.openclaw/workspace-state.json` 的 `managedAgents`
- 且当前存在 active goal 时，将 active goal 视为当前托管目标

### Current Goal State

显示：

- 当前 goal 标题
- 当前阶段
- 当前指导
- 避免策略
- 推荐下一步
- 当前风险

### Evolution Timeline

只展示该真实 Agent 在当前托管目标下的事实轨迹：

- failure
- reflection
- policy_update
- recovery
- progress

### System Gaps

第一版必须诚实暴露：

- retry-check history 仍未持久化
- recovery 仍是重算快照
- OpenClaw runtime registry 尚未直接接入
- 当前 goal 与 agent 的绑定仍是“managed agent + active goal”模型，而不是完整多 goal 历史

## Scope Guard

这次改动覆盖：

- `/ui` 首页主实体纠正
- `/ui/agents/:agentId` 详情主实体纠正
- workspace-state 托管 agent 绑定
- 真实托管 OpenClaw Agent 的最小展示链路

这次不覆盖：

- 完整 OpenClaw registry 同步
- 多 goal 历史归档
- 一个 Agent 并发管理多个 active goal
- OpenClaw 内嵌页

## Success Criteria

如果用户之前在 OpenClaw 中真实使用的是 `goal-engine-demo`，那么打开 `/ui` 后应该能看到：

- 首页卡片主标题是 `goal-engine-demo`
- 点进去后详情页主标题也是 `goal-engine-demo`
- 当前 goal、失败、反思、策略、恢复都作为这个真实 Agent 的托管历史出现

如果页面主标题仍然是 goal 名称，而不是 `goal-engine-demo`，就说明主实体仍然是错的。
