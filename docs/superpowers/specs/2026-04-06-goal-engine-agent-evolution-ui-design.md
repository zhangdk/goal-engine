# Goal Engine Agent Evolution UI Design

**Date:** 2026-04-06

**Supersedes:** `docs/superpowers/specs/2026-04-06-goal-engine-observability-ui-design.md`

**Goal:** 把当前“系统状态板”重设计成一个普通用户能看懂的 Agent 学习经历界面，让用户可以围绕某个 Agent 回答“它是谁、它最近在做什么、它有没有变化、为什么这么判断”。

## Problem Statement

当前 `/ui` 的问题不是功能缺失，而是信息结构错误。

它优先展示的是：

- 原始需求
- 当前 MVP 意图
- 当前实现差距

这些内容对 PM 和研发有价值，但不能回答普通用户最自然的问题：

- 我在看哪个 Agent
- 这个 Agent 最近在学什么
- 它有没有因为失败而改变
- 为什么我应该相信它真的变了

所以这次重设计的核心不是“把现有页面做得更漂亮”，而是把页面从**系统审计视角**切换成**Agent 观察视角**。

## Product Position

这版 UI 是：

- 面向用户观察 Agent 学习经历的产品界面
- 可用于 PM、研发和高级用户判断 Agent 是否发生变化
- 基于真实事件和真实状态的解释界面

这版 UI 不是：

- 一个新的产品需求定义器
- 一个纯工程状态仪表盘
- 一个只给研发看的 gap audit 面板

## Primary User Questions

新 UI 必须优先回答这四个问题：

1. 我在看哪个 Agent
2. 它最近在做什么
3. 它有没有因为失败而改变
4. 为什么这么判断

如果页面不能快速回答这四个问题，就算技术上功能齐全，也算失败。

## Information Architecture

新 UI 采用两层结构：

```text
Agent Gallery
  |
  +--> Agent Detail
         |
         +--> Header
         +--> Learning Verdict
         +--> Current State
         +--> Evolution Timeline
         +--> System Gaps
```

### Layer 1: Agent Gallery

首页不是系统总览，而是可观测 Agent 列表。

每张卡片只展示五项：

- Agent 名称
- 当前目标
- 学习结论
- 最近活跃时间
- 最近变化摘要

卡片示意：

```text
+--------------------------------------------------+
| goal-engine-demo                                 |
| Current goal: Ship Goal Engine UX                |
| Learning verdict: Partial improvement            |
| Last active: 5 min ago                           |
| Recent change: retry was blocked after reflection|
+--------------------------------------------------+
```

首页可以提供轻量筛选：

- All
- Improving
- Stalled
- Needs Review

### Layer 2: Agent Detail

详情页只围绕一个 Agent。

阅读顺序固定为：

1. `Learning Verdict`
2. `Current State`
3. `Evolution Timeline`
4. `System Gaps`

用户应该先得到结论，再决定是否深入看证据。

## Page Design

### 1. Agent Gallery

目的：

- 帮用户从多个 Agent 中快速选出值得观察的对象

每张卡片内容：

- `Agent name`
- `Current goal`
- `Learning verdict`
- `Last active`
- `Recent change summary`

卡片不展示技术术语，不展示 raw audit 状态，不展示 PRD 文字。

### 2. Agent Detail Header

Header 只负责重建上下文：

- Agent 名称
- 当前目标
- 当前状态
- 最近活跃时间
- 返回列表入口

### 3. Learning Verdict

这是详情页最重要的区块。

必须包含三个结论卡：

- `Behavior Changed`
- `Repeat Errors Reduced`
- `Memory Preserved`

每张卡都包含：

- `Yes / No / Partial`
- 一句原因
- 对应证据入口

例如：

- `Behavior Changed: Partial`
  - “A new guidance exists, but there is not enough follow-up behavior yet.”
- `Repeat Errors Reduced: Yes`
  - “A repeated retry was explicitly blocked by retry check.”
- `Memory Preserved: Yes`
  - “The latest recovery restored the active goal and current guidance.”

### 4. Current State

这块回答“这个 Agent 现在在哪里”。

展示：

- 当前目标
- 当前阶段
- 当前 guidance
- 当前禁止策略
- 推荐下一步
- 当前风险或阻塞

### 5. Evolution Timeline

这是证据层，不是日志 dump。

每条时间线事件都必须有统一结构：

- 时间
- 事件类型
- 发生了什么
- 带来了什么变化
- 可选的前后关联

事件类型第一版只做：

- `failure`
- `reflection`
- `policy_update`
- `retry_check`
- `recovery`
- `progress`

时间线示意：

```text
[10:12] Failure
Repeated the same path again.

[10:13] Reflection
Root cause: no new input before retry.

[10:13] Policy Update
Added avoid strategy: repeat.

[10:18] Retry Check
Blocked because path overlap was too high.

[10:26] Recovery
Restored active goal and updated guidance.
```

### 6. System Gaps

这块保留，但必须降级到页面底部。

第一版展示：

- retry-check history not persisted
- recovery event history not persisted
- OpenClaw-native UI not implemented

这块是“系统诚实度”，不是主视图。

## Verdict Model

第一版 verdict 只允许这四类：

- `No evidence yet`
- `Partial improvement`
- `Clear improvement`
- `Stalled`

### Verdict rules

#### No evidence yet

用于：

- 没有足够事件链
- 只有当前状态，没有失败/反思/恢复证据

#### Partial improvement

用于：

- 有失败
- 有 reflection
- 有 policy 更新
- 但还没有足够后续行为证明真的改变

#### Clear improvement

用于：

- 有失败
- 有 reflection
- 有 policy 更新
- 有 retry 被拦住，或后续 action 明显不同
- 有恢复后延续新 guidance 的证据

#### Stalled

用于：

- 仍在重复旧路径
- 最近证据显示变化不足
- 或已有 guidance，但行为没有改

### Verdict output shape

每个 verdict 都必须带：

- `level`
- `label`
- `reason`
- `evidenceEventIds`

Verdict 不能只是颜色标签，必须能解释自己。

## Data Model Strategy

这版 UI 要求后端至少提供两类聚合数据：

### 1. Gallery payload

接口建议：

- `GET /api/v1/ui/agents`

返回：

- `agentId`
- `name`
- `currentGoal`
- `learningVerdict`
- `lastActiveAt`
- `recentChangeSummary`

### 2. Detail payload

接口建议：

- `GET /api/v1/ui/agents/:agentId`

返回：

- `header`
- `learningVerdict`
- `currentState`
- `timeline`
- `systemGaps`

## First-Version Reality Constraint

当前系统未必已经有完整的 `agent` 领域模型。

因此第一版允许这样定义 `agent`：

- 一个可被观察的 goal/session context

也就是说，先把 UI 产品结构做对，再决定底层是否升级成真正的 agent identity model。

不要为了做首页卡片，先扩数据库和核心模型。

## UX Writing Rules

页面默认文案必须是用户语言：

- 不直接展示 `policy`, `retry_guard`, `recovery_packet`
- 使用：
  - `Current Strategy`
  - `Retry Check`
  - `Recovery`
  - `Learning Verdict`
  - `Recent Change`

工程术语仅允许在折叠调试区出现。

## Acceptance Criteria

这版重设计只有在下面这些条件成立时才算成功：

1. 用户一打开首页就能理解“我在看哪些 Agent”
2. 用户点进详情后，3 秒内能定位到：
   - 当前目标
   - 当前结论
   - 最近发生的变化
3. 时间线读起来像因果链，而不是技术日志
4. 差距信息还在，但不会压过主视图
5. 页面首先回答用户问题，而不是内部实现问题

## Not In Scope

第一版不做：

- 多维趋势图表
- 自动评分系统
- 社交化 Agent 比较榜
- 面向普通大众的 polished 品牌官网
- 真正的 agent identity schema 重构

## Migration Note

这份设计替代当前 observability UI 的主视图思路。

旧版的价值：

- 忠实展示原始需求和实现差距

新版的保留策略：

- 这些内容不删除，但移到 `System Gaps` 或次级调试面板

新的主视图优先级：

- Agent
- Verdict
- Current State
- Timeline
- Gaps
