# Goal Engine v0 Data Model

> 状态：已实施数据模型
> 日期：2026-04-03  
> 目标：定义 Goal Engine v0 的事实源、资源关系、存储字段、状态迁移和派生规则

---

## 1. 文档目的

这份文档回答的是：

**Goal Engine v0 到底存什么，哪些是事实源，哪些是派生视图，状态如何变化。**

它的作用是：

- 防止 service 在实现时把“资源”和“派生结果”混在一起
- 防止 retry guard、policy、recovery packet 在不同模块里各自发明自己的状态语义
- 给 SQLite schema、repository 和测试提供统一依据

---

## 2. 数据模型原则

### 2.1 事实源最小化

v0 的主事实源保留 5 类：

- `Goal`
- `Attempt`
- `Reflection`
- `Policy`
- `Knowledge`

### 2.2 派生结果不做唯一真相

以下对象属于派生结果，不应成为唯一事实源：

- `Recovery Packet`
- `Retry Guard Result`

它们可以被缓存、组装、返回，但必须能从事实源重建。

### 2.3 当前有效状态优先于历史版本系统

v0 不做复杂版本树。

第一版重点是：

- 当前 active goal
- 当前有效 policy
- 最近关键失败
- 最近有效进展

而不是历史版本管理平台。

### 2.4 schema 服务于行为变化闭环

字段设计不能只考虑“可存”，还必须支持下面三件事：

1. 失败后生成 reflection
2. reflection 更新 policy
3. 下一轮 retry guard 读取 policy 并阻止低质量重复

---

## 3. 事实源清单

### 3.1 Goals

存储系统当前要推进的目标。

职责：

- 表示当前任务对象
- 保存目标状态
- 保存当前阶段

### 3.2 Attempts

存储每一次尝试记录。

职责：

- 记录发生了什么
- 记录结果是什么
- 记录失败属于哪一类

### 3.3 Reflections

存储失败后的结构化反思。

职责：

- 记录本轮失败摘要
- 记录 root cause
- 记录必须改变什么

### 3.4 Policies

存储当前有效策略。

职责：

- 保存禁止重复的策略标签
- 保存下一步推荐方向
- 保存重试前必须检查的事项

`avoid_strategies` 仍保留兼容旧 projection 和 UI，但不再作为 retry guard 的单独硬阻断依据。

### 3.5 Knowledge

存储失败后形成的 descriptive cognition。

职责：

- 记录特定上下文下观察到了什么
- 记录系统对原因的假设
- 记录未来行动可参考的 implication
- 支撑 recovery packet 和 retry guard advisory

---

## 4. 表结构

### 4.1 `goals`

#### Purpose

作为系统的顶层工作对象。

#### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | `TEXT` | yes | 主键 |
| `title` | `TEXT` | yes | 目标标题 |
| `status` | `TEXT` | yes | `active / blocked / completed / abandoned` |
| `success_criteria` | `TEXT` | yes | JSON string array |
| `stop_conditions` | `TEXT` | yes | JSON string array |
| `priority` | `INTEGER` | yes | 默认 `1` |
| `current_stage` | `TEXT` | yes | 当前阶段 |
| `created_at` | `TEXT` | yes | ISO 时间 |
| `updated_at` | `TEXT` | yes | ISO 时间 |

#### Constraints

- `status` 必须属于允许枚举
- v0 默认只允许一个 `active` goal

### 4.2 `attempts`

#### Purpose

记录每一次尝试，不论成功、部分成功还是失败。

#### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | `TEXT` | yes | 主键 |
| `goal_id` | `TEXT` | yes | 外键 -> `goals.id` |
| `stage` | `TEXT` | yes | 当时所处阶段 |
| `action_taken` | `TEXT` | yes | 本轮做了什么 |
| `strategy_tags` | `TEXT` | yes | JSON string array |
| `result` | `TEXT` | yes | `success / partial / failure` |
| `failure_type` | `TEXT` | no | `result=failure` 时建议必填 |
| `confidence` | `REAL` | no | `0..1` |
| `next_hypothesis` | `TEXT` | no | 下一轮假设 |
| `created_at` | `TEXT` | yes | ISO 时间 |

#### Constraints

- `goal_id` 必须存在
- `result = failure` 时，`failure_type` 必须存在
- `failure_type` 的允许值以 `goal-engine-v0-implementation-baseline.md` 中冻结枚举为准

#### Field semantics

- `strategy_tags` 是行为路径标签，不是自由注释
- `strategy_tags` 的主要用途是支撑 `retry_guard`
- 标签命名应尽量稳定，以便跨 attempt 比较

### 4.3 `reflections`

#### Purpose

记录对某一次失败 attempt 的结构化反思。

#### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | `TEXT` | yes | 主键 |
| `goal_id` | `TEXT` | yes | 外键 -> `goals.id` |
| `attempt_id` | `TEXT` | yes | 外键 -> `attempts.id` |
| `summary` | `TEXT` | yes | 失败摘要 |
| `root_cause` | `TEXT` | yes | 根因 |
| `must_change` | `TEXT` | yes | 下一轮必须改变什么 |
| `avoid_strategy` | `TEXT` | no | 可选的禁止策略标签 |
| `created_at` | `TEXT` | yes | ISO 时间 |

#### Constraints

- `attempt_id` 必须存在
- v0 建议对 `attempt_id` 做唯一约束
  这样可保证“一次正式失败只对应一条正式 reflection”

### 4.4 `policies`

#### Purpose

保存当前有效策略。

#### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | `TEXT` | yes | 主键 |
| `goal_id` | `TEXT` | yes | 外键 -> `goals.id` |
| `preferred_next_step` | `TEXT` | no | 下一轮推荐方向 |
| `avoid_strategies` | `TEXT` | yes | JSON string array |
| `must_check_before_retry` | `TEXT` | yes | JSON string array |
| `updated_at` | `TEXT` | yes | ISO 时间 |

#### Constraints

- v0 建议对 `goal_id` 做唯一约束
- 每个 goal 只保留当前有效 policy 一份

### 4.5 `knowledge`

#### Purpose

保存从 reflection 或显式 API 写入的认知条目。

#### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | `TEXT` | yes | 主键 |
| `agent_id` | `TEXT` | yes | 外键 -> `agents.id` |
| `goal_id` | `TEXT` | yes | 复合外键 -> `goals(agent_id, id)` |
| `source_attempt_id` | `TEXT` | no | 复合外键 -> `attempts(agent_id, id)` |
| `context` | `TEXT` | yes | 发生条件/阶段 |
| `observation` | `TEXT` | yes | 观察到的事实 |
| `hypothesis` | `TEXT` | yes | 对原因的假设 |
| `implication` | `TEXT` | yes | 对未来行动的参考意义 |
| `related_strategy_tags` | `TEXT` | yes | JSON string array |
| `created_at` | `TEXT` | yes | ISO 时间 |

#### Constraints

- `knowledge` 归属于单个 `agent_id`
- `goal_id` / `source_attempt_id` 必须属于同一 agent
- 条目必须是 descriptive，不表达“系统禁止做 X”

### 4.6 `knowledge_promotions`

#### Purpose

保存经过整理后的可复用认知。

#### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | `TEXT` | yes | 主键 |
| `knowledge_id` | `TEXT` | yes | 外键 -> `knowledge.id` |
| `visibility` | `TEXT` | yes | `private / agent / global` |
| `agent_id` | `TEXT` | conditional | `global` 时必须为空；其他 visibility 必须存在 |
| `subject` | `TEXT` | yes | 主题标签 |
| `condition` | `TEXT` | yes | JSON object |
| `summary` | `TEXT` | yes | 简明结论 |
| `recommendation` | `TEXT` | yes | 建议，不是强制规则 |
| `confidence` | `REAL` | yes | `0..1` |
| `support_count` | `INTEGER` | yes | 默认 `1` |
| `created_at` | `TEXT` | yes | ISO 时间 |
| `updated_at` | `TEXT` | yes | ISO 时间 |

### 4.7 `knowledge_reference_events`

#### Purpose

记录 recovery packet / retry guard 何时引用了哪些认知，作为可审计 evidence。

#### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | `TEXT` | yes | 主键 |
| `agent_id` | `TEXT` | yes | 外键 -> `agents.id` |
| `goal_id` | `TEXT` | yes | 复合外键 -> `goals(agent_id, id)` |
| `retry_check_event_id` | `TEXT` | no | retry guard 引用时关联 |
| `knowledge_ids` | `TEXT` | yes | JSON string array |
| `promotion_ids` | `TEXT` | yes | JSON string array |
| `decision_surface` | `TEXT` | yes | `recovery_packet / retry_guard` |
| `created_at` | `TEXT` | yes | ISO 时间 |

---

## 5. 资源关系

### 5.1 Goal 与 Attempt

关系：

- 一个 Goal 对应多个 Attempts

语义：

- attempts 是该 goal 的执行历史

### 5.2 Attempt 与 Reflection

关系：

- 一个失败 Attempt 对应零或一条正式 Reflection

语义：

- 不是每条 attempt 都需要 reflection
- 但每条关键失败 attempt 应能对应一条 reflection

### 5.3 Goal 与 Policy

关系：

- 一个 Goal 对应一条当前有效 Policy

语义：

- policy 不是历史版本集合
- v0 只关心当前生效的策略快照

---

## 6. 状态迁移

### 6.1 Goal 状态迁移

```text
active -> blocked
active -> completed
active -> abandoned
blocked -> active
blocked -> abandoned
```

#### 语义

- `active`
  当前主目标，允许继续推进
- `blocked`
  当前不能继续，但未终止
- `completed`
  已达到成功条件
- `abandoned`
  明确结束，不再推进

### 6.2 Attempt 结果状态

Attempt 不做可变状态机，只记录写入时结果：

- `success`
- `partial`
- `failure`

Attempt 一旦创建，不应再被修改为另一种结果。

### 6.3 Policy 生命周期

Policy 不是 append-only 历史，而是 upsert 型当前状态。

#### 更新触发

- 新 reflection 写入后
- 系统需要根据最新失败或进展刷新当前策略时

#### 更新方式

- 用新的 `preferred_next_step`
- 合并或替换 `avoid_strategies`
- 更新 `must_check_before_retry`
- 更新时间戳

---

## 7. 派生对象

### 7.1 Recovery Packet

#### Definition

由以下事实源组合而来：

- 当前 goal
- 当前 policy
- 最近一次关键失败 reflection
- 最近一次有效进展 attempt 或阶段信息

#### Why derived

因为它本质上是：

- 面向新 session 的最小恢复视图

而不是原始业务事实。

### 7.2 Retry Guard Result

#### Definition

由以下输入动态计算：

- 当前 policy
- 当前 planned action
- 当前 strategy tags
- 当前是否 acknowledged policy

#### Why derived

因为它是判断结果，而不是需要长期保存的资源。

如果以后要做审计日志，可以单独增加 `guard_checks`，但 v0 不需要。

---

## 8. 索引与查询建议

### 8.1 `goals`

建议索引：

- `status`
- `updated_at`

用途：

- 查当前 active goal

### 8.2 `attempts`

建议索引：

- `goal_id`
- `created_at`
- `goal_id + created_at`
- `goal_id + result`

用途：

- 查某 goal 最近 attempts
- 查最近失败

### 8.3 `reflections`

建议索引：

- `goal_id`
- `attempt_id`
- `created_at`

用途：

- 查某 goal 最近 reflection
- 从 attempt 定位 reflection

### 8.4 `policies`

建议索引：

- `goal_id` unique

用途：

- 快速读取当前 policy

---

## 9. TTL、冷热分层与归档

### 9.1 v0 立场

v0 不强制在数据库层立即实现复杂 TTL 机制，但数据模型必须为后续 TTL 留出语义空间。

### 9.2 热数据

热路径优先关注：

- 当前 active goal
- 当前 policy
- 最近失败相关 attempts / reflections
- 最近一次有效进展

### 9.3 冷数据

更老的数据可以视为冷数据：

- 较早的 attempts
- 较早的 reflections

这些数据仍然有研究和评估价值，但不应默认进入每轮热路径。

### 9.4 v0 的简化处理

第一版可以先不物理归档，只在查询层控制：

- 默认只查最近 N 条
- 恢复包只用最近关键数据

---

## 10. Schema 与 API 的映射规则

### 10.1 DB 层

数据库字段统一使用：

- `snake_case`

### 10.2 API 层

HTTP JSON 也统一使用：

- `snake_case`

### 10.3 Adapter 层

TypeScript adapter 可以映射为：

- `camelCase`

但映射必须集中处理，不能让 repository、route、adapter 各自发明不同字段名。

---

## 11. 一致性约束

### 11.1 Reflection 与 Policy 一致性

一条 reflection 写入后，当前 policy 必须同步更新。

不能出现：

- reflection 已存在
- 但 `GET /policies/current` 读到旧 policy

如果暂时做不到真正事务，也必须在实现上保证“要么都成功，要么都失败”。

### 11.2 Recovery Packet 与事实源一致性

recovery packet 每次读取都应尽量反映当前事实源。

如果有缓存：

- 缓存只是性能手段
- 不能成为唯一真相

### 11.3 Retry Guard 纯判断一致性

retry guard 不应修改：

- goal
- attempt
- reflection
- policy

否则测试和行为都容易变得不可预测。

---

## 12. v0 非目标

这份数据模型当前不覆盖：

- 多租户
- 多 workspace
- 多 active goals 并存策略
- policy 历史版本树
- guard 检查审计历史
- 长期向量记忆
- embedding 检索

这些都不是 v0 闭环成立的必要条件。

---

## 13. 当前结论

Goal Engine v0 的数据模型必须保持克制：

- 事实源只有 `Goal / Attempt / Reflection / Policy`
- `Recovery Packet` 和 `Retry Guard Result` 都是派生结果
- 状态机只做最小必要复杂度
- 当前有效状态优先于历史版本系统

只有这样，v0 才能先把“失败后行为必须变化”的闭环跑通，而不是提前长成一个过重的平台。
