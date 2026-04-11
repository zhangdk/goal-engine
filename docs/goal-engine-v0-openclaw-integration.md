# Goal Engine v0 OpenClaw Integration

> 状态：可实施草案  
> 日期：2026-04-03  
> 目标：定义 Goal Engine v0 在 OpenClaw 中的接入点、职责边界、触发顺序与本地投影规则

---

## 1. 文档目的

这份文档只回答一个问题：

**Goal Engine v0 在 OpenClaw 里到底怎么接，哪些能力放本地，哪些能力放服务端，哪些触发必须被强制执行。**

它不讨论：

- Goal Engine 的产品定位
- HTTP API contract 细节
- 数据库 schema

它要解决的是集成层最容易出现的混乱：

- 什么都往 `AGENTS.md` 塞
- 什么都想写进 `MEMORY.md`
- 只靠 Agent 自己“想起来”去读长期状态
- 把服务端做成远程大脑

---

## 2. 集成目标

OpenClaw 集成层必须同时满足四个目标：

1. 不替代 Agent 主体
2. 让长期状态能被当前轮次读取
3. 让失败后写回和下一轮检查不会被跳过
4. 不依赖超长上下文来维持连续性

---

## 3. 集成原则

### 3.1 Agent 继续是执行主体

OpenClaw Agent 负责：

- 当前轮推理
- 当前动作执行
- 工具调用
- 局部计划微调

Goal Engine 不直接生成完整执行计划，也不替 Agent 决定一切。

### 3.2 服务端继续是长期控制层

Goal Engine service 负责：

- 保存长期状态
- 生成或更新 policy
- 判断 retry guard
- 生成 recovery packet

### 3.3 本地工作区只保留投影，不保留全量事实

本地文件层的职责是：

- 把当前轮需要的最小信息投影给模型

不是：

- 承载全部 attempts
- 承载全部 reflections
- 承载 policy 历史

### 3.4 关键节点必须强制触发

集成层不能依赖：

- “模型自己会想到”
- “只要规则写进 prompt 就会执行”

必须有明确触发顺序和强制检查点。

---

## 4. OpenClaw 本地接入点分工

### 4.1 `AGENTS.md`

#### 作用

写长期行为原则和固定工作规则。

#### 应写内容

- 当前任务系统使用 Goal Engine
- 失败后必须写 attempt
- 失败后必须生成或提交 reflection
- 下一轮前必须读取当前 policy
- 新 session 应先读取 recovery packet

#### 不应写内容

- 全量历史记录
- 频繁变化的阶段细节
- 长篇 reflection 原文

#### 推荐口径

`AGENTS.md` 只写“必须怎么做”，不写“最近具体发生了什么”。

### 4.2 `SOUL.md`

#### 作用

只保留人格、边界和风格。

#### 应写内容

- 你对长期目标有责任感
- 你不把单次失败视为终局
- 你不会越权、作弊或绕过边界

#### 不应写内容

- 当前 goal 状态
- 当前 policy
- 当前 recovery packet
- 当前阶段控制信息

`SOUL.md` 不是任务状态文件。

### 4.3 `HEARTBEAT.md`

#### 作用

写周期唤醒时的检查清单。

#### 应写内容

- 检查是否仍有 active goal
- 检查是否存在最近失败但未生成 reflection
- 检查是否该重新读取 recovery packet
- 检查是否长时间无进展

#### 不应写内容

- 具体 HTTP payload
- 低层实现细节

### 4.4 memory files

#### 作用

作为当前可见投影层，而不是事实库存。

#### 可放内容

- 当前主目标摘要
- 当前阶段
- 最近失败摘要
- 当前禁止重复策略
- 当前推荐下一步

#### 不应放内容

- 全量 attempts
- 全量 reflections
- 历史 policy 列表
- 大段对话原文复制

### 4.5 plugin tools

#### 作用

为 Agent 提供 Goal Engine 的显式读写能力。

#### v0 必须存在的工具

- `goal_get_current`
- `attempt_append`
- `reflection_generate`
- `policy_get_current`
- `retry_guard_check`
- `recovery_packet_get`

#### 原则

- 工具是能力接口
- 不应把复杂业务逻辑散在本地工具里
- 业务判断仍应由 Goal Engine service 完成

#### 面向用户的显式入口

v0 的底层工具名可以继续保持：

- `goal_get_current`
- `attempt_append`
- `reflection_generate`
- `policy_get_current`
- `retry_guard_check`
- `recovery_packet_get`

但面向 OpenClaw 用户的第一版显式入口，不应直接把这些内部名字暴露给用户。

推荐对外入口语义：

- `start goal`
- `show goal status`
- `record failed attempt`
- `recover current goal`
- `check retry`

原则：

- 用户看到的是任务动作，不是 API 或内部控制层术语
- tool 名可以保留实现语义，对外入口应保留用户语义
- 对外入口的输出必须是“下一步可行动”的摘要，而不是底层 JSON

### 4.6 hooks

#### 作用

保证关键步骤不会被跳过。

#### v0 推荐关注的 hook 类职责

- 运行前：注入当前 goal / policy / recovery packet 摘要
- 工具前：在重试前要求先过 retry guard
- 运行后：失败时提醒必须写回 attempt / reflection

#### 原则

- hook 是强制层
- 它不是新的推理层

### 4.7 heartbeat / cron

#### heartbeat

适合做：

- 周期巡检
- 未完成目标提醒
- 卡住状态检查
- 是否需要重新读取 recovery packet

#### cron

v0 可选，不是必须。

如果使用，更适合做：

- 独立 session 的深复盘
- 周期统计
- 冷路径归档任务

---

## 5. 本地投影规则

### 5.1 投影目标

投影的目的不是“让模型知道一切”，而是：

**让模型在当前轮知道继续推进所需的最小信息。**

### 5.2 投影最小字段

v0 推荐投影只包含：

1. 当前主目标
2. 当前阶段
3. 当前成功条件摘要
4. 最近失败摘要
5. 当前 `avoid_strategies`
6. 当前 `preferred_next_step`

### 5.3 投影更新时机

以下时机必须刷新投影：

1. 新 session 开始前
2. policy 更新后
3. 当前阶段变化后
4. recovery packet 重新生成后

### 5.4 投影介质

v0 推荐两种方式：

- 本地 summary 文件
- 运行前 hook 注入的短上下文

二者可以并存，但内容必须一致，不允许各写各的版本。

---

## 6. 强制触发顺序

### 6.1 开始一轮前

必须执行：

1. `goal_get_current`
2. 若存在 policy：`policy_get_current`
3. 刷新本地最小投影

面向用户的显式入口等价于：

1. `show goal status`
2. 若为新 session，优先走 `recover current goal`

### 6.2 结束一轮后

必须执行：

1. `attempt_append`

若结果为失败，继续：

2. `reflection_generate`
3. 提交 reflection
4. 刷新当前 policy
5. 刷新 recovery packet 投影

面向用户的显式入口等价于：

- `record failed attempt`

要求：

- 用户不必分别调用 `attempt_append`、`reflection_generate`、`create reflection`
- 集成层可以把它们封装成一个显式失败写回动作

### 6.3 准备重试前

必须执行：

1. 读取当前 policy
2. `retry_guard_check`

若 guard 不通过：

- 不允许按原路径直接继续

面向用户的显式入口等价于：

- `check retry`

输出要求：

- 必须直接告诉用户“这次是否允许继续”
- 若不允许，必须说明当前缺了什么变化
- 默认展示用户解释，保留底层 reason code 供调试

### 6.4 新 session 开始前

必须执行：

1. `recovery_packet_get`
2. `policy_get_current`
3. 刷新本地投影

面向用户的显式入口等价于：

- `recover current goal`

输出要求：

- 当前目标
- 当前阶段
- 最近失败摘要
- 当前禁止重复策略
- 推荐下一步

如果没有 active goal：

- 必须返回明确空状态，而不是只返回底层 `404`

---

## 7. 集成层的禁止事项

### 7.1 禁止把 OpenClaw 本地文件当主数据库

本地文件不是：

- attempts 表
- reflections 表
- policies 表

### 7.2 禁止让 hook 隐式改写事实源

hook 可以触发检查、注入摘要、提醒写回。

但不应在没有明确调用链的情况下偷偷修改主状态。

### 7.3 禁止跳过 retry guard

如果 Goal Engine 已经声明要对“失败后行为变化”负责，那重试前就不能只是建议性读取 policy。

必须有明确检查点。

### 7.4 禁止把完整历史重新灌回每个 session

如果每次新 session 都重新加载大段历史，就违背了 recovery packet 的设计目标。

---

## 8. 最小集成流程

### 8.1 成功路径

```text
session start
  -> load goal summary
  -> optional policy
  -> execute action
  -> append attempt(success/partial)
```

### 8.2 失败路径

```text
execute action
  -> attempt fails
  -> append attempt(failure)
  -> generate reflection
  -> submit reflection
  -> update policy
  -> refresh recovery packet
  -> before retry run retry guard
```

### 8.3 新 session 路径

```text
new session
  -> load recovery packet
  -> load current policy
  -> rebuild local projection
  -> continue same goal
```

---

## 9. 推荐文件布局

这不是硬性要求，但 v0 推荐本地工作区至少保留以下布局：

```text
workspace/
  AGENTS.md
  SOUL.md
  HEARTBEAT.md
  MEMORY.md
  goal-engine/
    current-goal.md
    current-policy.md
    recovery-packet.md
```

### 9.1 各文件职责

- `AGENTS.md`
  总规则
- `SOUL.md`
  人格与边界
- `HEARTBEAT.md`
  周期检查清单
- `MEMORY.md`
  长期但精简的人工可读摘要
- `goal-engine/current-goal.md`
  当前主目标投影
- `goal-engine/current-policy.md`
  当前 policy 投影
- `goal-engine/recovery-packet.md`
  当前恢复包投影

---

## 10. v0 推荐实现顺序

按集成层顺序，推荐先做：

1. adapter 工具
2. 当前 goal / policy / recovery packet 的本地投影文件
3. 失败后写回流程
4. 重试前 retry guard 检查
5. heartbeat 检查清单

hook 的自动化可以在上述链路跑通后再收紧。

---

## 11. 当前结论

Goal Engine v0 的 OpenClaw 集成，不是“多写几个 prompt 文件”。

它必须形成一个明确分工：

- `AGENTS.md` 负责规则
- `SOUL.md` 负责人格边界
- `HEARTBEAT.md` 负责周期检查
- plugin tools 负责能力接口
- hooks 负责强制触发
- 本地投影文件负责最小上下文可见性

只有这些边界清楚了，Goal Engine 才不会退化成“更厚的本地记忆模板”。
