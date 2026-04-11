# Goal Engine v0 API Contract

> 状态：已实施契约
> 日期：2026-04-03  
> 目标：定义 Goal Engine v0 的正式 HTTP/API 契约，供 service 与 agent-adapter 实现

---

## 1. 文档目的

这份文档只回答一个问题：

**Goal Engine v0 的服务端应该暴露哪些接口，这些接口的请求、响应、错误语义和幂等规则是什么。**

它不讨论：

- UI
- 具体数据库实现
- 具体 OpenClaw hook 代码
- 部署方式

这份契约文档是：

- `service/` 的后端实现基线
- `agent-adapter/` 的工具封装基线
- 后续测试与集成验证的边界

---

## 2. API 设计原则

### 2.1 版本化

所有正式接口使用：

`/api/v1/...`

原因：

- 后续字段调整和行为收紧不可避免
- 现在就留出版本边界，后续不会因为早期试验把路径搞乱

### 2.2 风格

资源尽量使用 noun-based REST 风格。

但以下场景允许动作型接口：

- `retry_guard_check`
- `reflection_generate`

因为它们更像“判断/生成动作”，不是简单 CRUD。

### 2.3 响应格式

统一使用 envelope：

成功：

```json
{
  "data": {}
}
```

错误：

```json
{
  "error": {
    "code": "validation_error",
    "message": "Request validation failed",
    "details": []
  }
}
```

### 2.4 时间格式

所有时间字段统一使用：

- ISO 8601 UTC 字符串
- 示例：`2026-04-03T08:00:00.000Z`

### 2.5 身份与范围

v0 默认是：

- 单用户
- 单工作区
- 单 Agent 主体

因此第一版不引入复杂 auth 体系，但要保留未来扩展位。

推荐做法：

- 本地开发可不鉴权
- 预留 `X-Agent-Id` / `X-Workspace-Id` header 扩展位

### 2.6 v0 实施冻结点

如果本文件与实施细节存在歧义，以 `goal-engine-v0-implementation-baseline.md` 为准。

尤其以下几点已经冻结：

- `failure_type` 使用固定枚举
- `reflection_generate` 默认是 adapter 必备能力、service 可选 route
- `retry_guard` 使用可解释启发式规则，不依赖黑盒相似度判断

---

## 3. 资源与工具映射

Agent 侧工具名与 HTTP 接口映射如下：

| Agent Tool | HTTP Endpoint |
|---|---|
| `goal_get_current` | `GET /api/v1/goals/current` |
| `attempt_append` | `POST /api/v1/attempts` |
| `reflection_generate` | `POST /api/v1/reflections/generate` |
| `policy_get_current` | `GET /api/v1/policies/current` |
| `retry_guard_check` | `POST /api/v1/retry-guard/check` |
| `recovery_packet_get` | `GET /api/v1/recovery-packet` |
| `knowledge_create` | `POST /api/v1/knowledge` |

### 3.1 面向 OpenClaw 用户的显式入口

在 v0 到 v1 的“用户可体验”阶段，OpenClaw 集成不应要求用户直接理解底层 tool 名或 HTTP endpoint。

推荐对外显式入口与底层能力映射如下：

| User-Facing Entrypoint | Underlying Capability |
|---|---|
| `start goal` | `POST /api/v1/goals` + projection refresh |
| `show goal status` | `goal_get_current` + optional `policy_get_current` + projection refresh |
| `record failed attempt` | `attempt_append` + `reflection_generate` + `POST /api/v1/reflections` + projection refresh |
| `recover current goal` | `recovery_packet_get` + optional `policy_get_current` + projection rebuild |
| `check retry` | `retry_guard_check` |

要求：

- 用户主入口返回的是摘要和下一步建议，不是原始 HTTP envelope
- 集成层可以保留底层 code 用于调试，但默认文案必须面向用户
- projection refresh / rebuild 属于集成流程的一部分，不应要求用户手动调用

### 3.2 面向用户的文案语义

推荐统一文案：

- `policy` -> `current guidance` / `当前策略建议`
- `retry_guard` -> `retry check` / `重复尝试检查`
- `recovery_packet` -> `recovery summary` / `恢复摘要`

这些映射不改变底层 contract，只改变 OpenClaw 用户体验层的展示和命名。

补充资源接口：

| Purpose | HTTP Endpoint |
|---|---|
| create goal | `POST /api/v1/goals` |
| patch goal | `PATCH /api/v1/goals/:goalId` |
| list attempts | `GET /api/v1/attempts` |
| create reflection | `POST /api/v1/reflections` |
| list knowledge | `GET /api/v1/knowledge?goal_id=...` |
| promote knowledge | `POST /api/v1/knowledge/:knowledgeId/promotions` |
| list shared wisdom | `GET /api/v1/knowledge/shared?subjects=...` |
| health | `GET /api/v1/health` |

---

## 4. 共享资源模型

### 4.1 Goal

```json
{
  "id": "goal_123",
  "title": "Compile a structured vendor comparison",
  "status": "active",
  "success_criteria": [
    "At least 10 vendors evaluated",
    "Output written to markdown"
  ],
  "stop_conditions": [
    "User cancels",
    "Blocked for 3 consecutive runs"
  ],
  "priority": 1,
  "current_stage": "research",
  "created_at": "2026-04-03T08:00:00.000Z",
  "updated_at": "2026-04-03T08:05:00.000Z"
}
```

### 4.2 Attempt

```json
{
  "id": "attempt_123",
  "goal_id": "goal_123",
  "stage": "research",
  "action_taken": "Queried vendor docs for memory architecture",
  "strategy_tags": ["vendor-docs", "official-docs"],
  "result": "failure",
  "failure_type": "strategy_mismatch",
  "confidence": 0.42,
  "next_hypothesis": "Switch to narrower search and compare only 3 vendors first",
  "created_at": "2026-04-03T08:10:00.000Z"
}
```

#### `failure_type` enum

v0 冻结为：

`tool_error | capability_gap | strategy_mismatch | external_blocker | resource_limit | validation_fail | stuck_loop | ambiguous_goal`

### 4.3 Reflection

```json
{
  "id": "reflection_123",
  "goal_id": "goal_123",
  "attempt_id": "attempt_123",
  "summary": "The search strategy was too broad and produced noisy sources.",
  "root_cause": "The agent used a generic search path instead of a constrained vendor set.",
  "must_change": "Limit the next run to three target vendors and only official docs.",
  "avoid_strategy": "broad-web-search",
  "created_at": "2026-04-03T08:11:00.000Z"
}
```

### 4.4 Policy

```json
{
  "id": "policy_123",
  "goal_id": "goal_123",
  "preferred_next_step": "Compare three official vendor docs only",
  "avoid_strategies": ["broad-web-search"],
  "must_check_before_retry": [
    "Confirm current stage",
    "Use a narrower vendor set"
  ],
  "updated_at": "2026-04-03T08:12:00.000Z"
}
```

`avoid_strategies` is retained for backward compatibility. New behavior should treat it as risk context, not as a standalone hard ban.

### 4.5 Knowledge

```json
{
  "id": "knowledge_123",
  "agent_id": "goal-engine-demo",
  "goal_id": "goal_123",
  "source_attempt_id": "attempt_123",
  "context": "Goal stage research; attempted broad web search",
  "observation": "The search produced noisy sources and no concrete rate-limit document",
  "hypothesis": "The query scope was too broad for this evidence need",
  "implication": "Use official docs or a narrower subject before retrying",
  "related_strategy_tags": ["broad-web-search"],
  "created_at": "2026-04-11T08:00:00.000Z"
}
```

Knowledge is descriptive. It records what was observed and what that may imply; it does not forbid future action.

### 4.6 Knowledge Promotion

```json
{
  "id": "promotion_123",
  "knowledge_id": "knowledge_123",
  "visibility": "agent",
  "agent_id": "goal-engine-demo",
  "subject": "rate-limit-research",
  "condition": { "stage": "research" },
  "summary": "Broad web search was noisy for rate-limit evidence",
  "recommendation": "Start with official API docs",
  "confidence": 0.7,
  "support_count": 1,
  "created_at": "2026-04-11T08:00:00.000Z",
  "updated_at": "2026-04-11T08:00:00.000Z"
}
```

`visibility` values:

- `private`: current agent/goal source knowledge
- `agent`: reusable by the same agent across goals
- `global`: reusable across agents, requires `reviewed: true` at promotion time

### 4.7 Retry Guard Result

```json
{
  "allowed": false,
  "reason": "no_meaningful_change",
  "warnings": [
    "Strategy overlaps legacy avoid_strategy; treat this as risk context, not a hard block."
  ],
  "advisories": [
    "Context: Goal stage research; attempted broad web search. Implication: Use official docs or a narrower subject before retrying."
  ],
  "knowledge_context": [],
  "referenced_knowledge_ids": []
}
```

Important behavior:

- `blocked_strategy_overlap` remains in the type union for historical event compatibility.
- New checks do not hard-block solely because a planned strategy overlaps `avoid_strategy`.
- Overlap is surfaced through `warnings`; the hard-block reason should come from missing acknowledgement, no meaningful change, or repeated failure without downgrade.

### 4.8 Recovery Packet

```json
{
  "goal_id": "goal_123",
  "goal_title": "Compile a structured vendor comparison",
  "current_stage": "research",
  "success_criteria": [
    "At least 10 vendors evaluated",
    "Output written to markdown"
  ],
  "last_meaningful_progress": "Identified 3 target vendors",
  "last_failure_summary": "Broad search produced noisy sources",
  "avoid_strategies": ["broad-web-search"],
  "preferred_next_step": "Compare three official vendor docs only",
  "generated_at": "2026-04-03T08:15:00.000Z"
}
```

---

## 5. 错误模型

### 5.1 标准错误格式

```json
{
  "error": {
    "code": "validation_error",
    "message": "Request validation failed",
    "details": [
      {
        "field": "goal_id",
        "message": "goal_id is required",
        "code": "required"
      }
    ]
  }
}
```

### 5.2 通用错误码

| HTTP | code | Use Case |
|---|---|---|
| `400` | `invalid_json` | 请求体不是合法 JSON |
| `422` | `validation_error` | 字段缺失、枚举非法、格式不对 |
| `404` | `not_found` | 资源不存在 |
| `404` | `no_active_goal` | 当前没有 active goal |
| `404` | `no_policy_yet` | 当前 goal 还没有 policy |
| `409` | `state_conflict` | 当前状态不允许执行该动作 |
| `409` | `duplicate_reflection` | 同一个 attempt 已存在 reflection |
| `409` | `retry_blocked` | retry guard 不允许通过 |
| `500` | `internal_error` | 未知服务端错误 |

### 5.3 重要语义

- `policy_get_current` 若当前没有 policy，返回 `404 no_policy_yet`
- `goal_get_current` 若没有 active goal，返回 `404 no_active_goal`
- `retry_guard_check` 若业务判断不允许继续，仍返回 `200`
  原因：这是业务判断结果，不是服务错误

---

## 6. Endpoint Contract

### 6.1 `POST /api/v1/goals`

创建一个 goal。

#### Request

```json
{
  "title": "Compile a structured vendor comparison",
  "success_criteria": [
    "At least 10 vendors evaluated",
    "Output written to markdown"
  ],
  "stop_conditions": [
    "User cancels"
  ],
  "priority": 1,
  "current_stage": "research"
}
```

#### Validation

- `title`: required, non-empty string
- `success_criteria`: required, non-empty string array
- `stop_conditions`: optional string array, default `[]`
- `priority`: optional integer, default `1`
- `current_stage`: optional string, default `initial`

#### Response

`201 Created`

```json
{
  "data": {
    "id": "goal_123",
    "title": "Compile a structured vendor comparison",
    "status": "active",
    "success_criteria": ["At least 10 vendors evaluated", "Output written to markdown"],
    "stop_conditions": ["User cancels"],
    "priority": 1,
    "current_stage": "research",
    "created_at": "2026-04-03T08:00:00.000Z",
    "updated_at": "2026-04-03T08:00:00.000Z"
  }
}
```

#### Notes

- v0 默认只允许一个 active goal
- 若已存在 active goal 且不允许并存，返回 `409 state_conflict`

### 6.2 `GET /api/v1/goals/current`

返回当前 active goal。

#### Response

`200 OK`

```json
{
  "data": {
    "id": "goal_123",
    "title": "Compile a structured vendor comparison",
    "status": "active",
    "success_criteria": ["At least 10 vendors evaluated", "Output written to markdown"],
    "stop_conditions": ["User cancels"],
    "priority": 1,
    "current_stage": "research",
    "created_at": "2026-04-03T08:00:00.000Z",
    "updated_at": "2026-04-03T08:05:00.000Z"
  }
}
```

#### Error

`404 no_active_goal`

### 6.3 `PATCH /api/v1/goals/:goalId`

更新 goal 的可变字段。

#### Allowed fields

- `status`
- `current_stage`
- `priority`
- `success_criteria`
- `stop_conditions`

#### Response

`200 OK`

返回更新后的 Goal。

#### Notes

- v0 不支持部分字段的复杂并发合并
- 服务端以“最后写入为准”为默认策略

### 6.4 `POST /api/v1/attempts`

写入一条 attempt。

对应 Agent Tool：`attempt_append`

#### Request

```json
{
  "goal_id": "goal_123",
  "stage": "research",
  "action_taken": "Queried vendor docs for memory architecture",
  "strategy_tags": ["vendor-docs", "official-docs"],
  "result": "failure",
  "failure_type": "strategy_mismatch",
  "confidence": 0.42,
  "next_hypothesis": "Compare only 3 vendors next time"
}
```

#### Validation

- `goal_id`: required
- `stage`: required
- `action_taken`: required
- `strategy_tags`: required string array
- `result`: one of `success | partial | failure`
- `failure_type`: required when `result = failure`
- `confidence`: optional number `0..1`

#### Response

`201 Created`

返回完整 Attempt。

#### Idempotency

v0 默认不做自动幂等。

原因：

- 每条 attempt 应视为新的执行记录
- 调用方若需要防止重复提交，应自行提供调用保障

未来可以增加：

- `Idempotency-Key`

### 6.5 `GET /api/v1/attempts`

列出 attempt。

#### Query params

- `goal_id` required
- `limit` optional, default `20`, max `100`
- `result` optional
- `stage` optional

#### Response

`200 OK`

```json
{
  "data": [
    {
      "id": "attempt_123",
      "goal_id": "goal_123",
      "stage": "research",
      "action_taken": "Queried vendor docs for memory architecture",
      "strategy_tags": ["vendor-docs", "official-docs"],
      "result": "failure",
      "failure_type": "strategy_mismatch",
      "confidence": 0.42,
      "next_hypothesis": "Compare only 3 vendors next time",
      "created_at": "2026-04-03T08:10:00.000Z"
    }
  ],
  "meta": {
    "limit": 20
  }
}
```

### 6.6 `POST /api/v1/reflections/generate`

根据失败上下文生成一个 reflection 草稿。

对应 Agent Tool：`reflection_generate`

#### Why POST

因为这是一个生成动作，不是资源查询。

#### Request

```json
{
  "goal_id": "goal_123",
  "attempt_id": "attempt_123",
  "stage": "research",
  "action_taken": "Queried vendor docs for memory architecture",
  "failure_type": "strategy_mismatch",
  "additional_context": "Sources were too noisy and not comparable"
}
```

#### Response

`200 OK`

```json
{
  "data": {
    "summary": "The search strategy was too broad and produced noisy sources.",
    "root_cause": "The agent used a generic search path instead of a constrained vendor set.",
    "must_change": "Limit the next run to three target vendors and only official docs.",
    "avoid_strategy": "broad-web-search"
  }
}
```

#### Notes

- 这是“生成草稿”接口，不直接持久化
- 若后续继续采用“Agent 本地 LLM 生成 reflection”的路线，这个接口可以改为 adapter 内部纯函数，不必保留为服务端路由
- 所以它在 v0 中是 **optional route**

### 6.7 `POST /api/v1/reflections`

写入一条 reflection，并触发 policy 更新。

#### Request

```json
{
  "goal_id": "goal_123",
  "attempt_id": "attempt_123",
  "summary": "The search strategy was too broad and produced noisy sources.",
  "root_cause": "The agent used a generic search path instead of a constrained vendor set.",
  "must_change": "Limit the next run to three target vendors and only official docs.",
  "avoid_strategy": "broad-web-search"
}
```

#### Response

`201 Created`

```json
{
  "data": {
    "reflection": {
      "id": "reflection_123",
      "goal_id": "goal_123",
      "attempt_id": "attempt_123",
      "summary": "The search strategy was too broad and produced noisy sources.",
      "root_cause": "The agent used a generic search path instead of a constrained vendor set.",
      "must_change": "Limit the next run to three target vendors and only official docs.",
      "avoid_strategy": "broad-web-search",
      "created_at": "2026-04-03T08:11:00.000Z"
    },
    "policy": {
      "id": "policy_123",
      "goal_id": "goal_123",
      "preferred_next_step": "Limit next run to three official vendors",
      "avoid_strategies": ["broad-web-search"],
      "must_check_before_retry": [
        "Confirm current stage",
        "Use a narrower vendor set"
      ],
      "updated_at": "2026-04-03T08:12:00.000Z"
    }
  }
}
```

#### Side effects

- 必须更新或创建当前 Goal 的 policy
- 必须刷新 recovery packet 所需的最新状态

#### Idempotency

同一个 `attempt_id` 默认只允许一条正式 reflection。

若重复提交：

- 返回 `409 duplicate_reflection`

### 6.8 `GET /api/v1/policies/current`

返回某个 goal 当前有效 policy。

对应 Agent Tool：`policy_get_current`

#### Query params

- `goal_id` required

#### Response

`200 OK`

```json
{
  "data": {
    "id": "policy_123",
    "goal_id": "goal_123",
    "preferred_next_step": "Compare three official vendor docs only",
    "avoid_strategies": ["broad-web-search"],
    "must_check_before_retry": [
      "Confirm current stage",
      "Use a narrower vendor set"
    ],
    "updated_at": "2026-04-03T08:12:00.000Z"
  }
}
```

#### Error

`404 no_policy_yet`

### 6.9 `POST /api/v1/retry-guard/check`

检查本轮计划是否允许继续。

对应 Agent Tool：`retry_guard_check`

#### Request

```json
{
  "goal_id": "goal_123",
  "planned_action": "Search broad web for more vendors",
  "what_changed": "No meaningful change",
  "strategy_tags": ["broad-web-search"],
  "policy_acknowledged": true
}
```

#### Response

`200 OK`

```json
{
  "data": {
    "allowed": false,
    "reason": "retry_blocked",
    "warnings": [
      "planned action overlaps with a blocked strategy",
      "no meaningful change detected"
    ],
    "tag_overlap_rate": 1
  }
}
```

#### Semantics

- `allowed = false` 是业务判断，不是接口错误
- 即使不允许继续，也返回 `200`

#### Guard minimum rules

服务端至少要检查：

1. 是否读取过当前 policy
2. 是否命中 `avoid_strategies`
3. 是否没有发生足够行为变化

#### v0 blocked reason set

v0 建议 `reason` 收敛为：

- `allowed`
- `policy_not_acknowledged`
- `blocked_strategy_overlap`
- `no_meaningful_change`
- `repeated_failure_without_downgrade`

### 6.10 `GET /api/v1/recovery-packet`

返回某个 goal 的最小恢复包。

对应 Agent Tool：`recovery_packet_get`

#### Query params

- `goal_id` required

#### Response

`200 OK`

```json
{
  "data": {
    "goal_id": "goal_123",
    "goal_title": "Compile a structured vendor comparison",
    "current_stage": "research",
    "success_criteria": [
      "At least 10 vendors evaluated",
      "Output written to markdown"
    ],
    "last_meaningful_progress": "Identified 3 target vendors",
    "last_failure_summary": "Broad search produced noisy sources",
    "avoid_strategies": ["broad-web-search"],
    "preferred_next_step": "Compare three official vendor docs only",
    "generated_at": "2026-04-03T08:15:00.000Z"
  }
}
```

#### Error

- `404 not_found` when goal does not exist
- `409 state_conflict` when goal exists but lacks enough state to generate packet

### 6.11 `GET /api/v1/health`

健康检查接口。

#### Response

`200 OK`

```json
{
  "data": {
    "status": "ok"
  }
}
```

---

## 7. 字段命名规则

### 7.1 HTTP JSON

HTTP JSON payload 统一使用：

- `snake_case`

原因：

- 更适合 REST JSON contract
- 与未来多语言实现兼容性更好

### 7.2 TypeScript Adapter

`agent-adapter` 内部可以映射成：

- `camelCase`

例如：

- API field: `goal_id`
- Adapter field: `goalId`

但映射规则必须单点收口，不能分散在各个工具里隐式处理。

---

## 8. 状态与副作用规则

### 8.1 Reflection 写入后必须更新 Policy

`POST /reflections` 不能只存 reflection。

它必须同步完成：

- reflection 持久化
- policy upsert

否则调用方会遇到“写完 reflection 但下一轮取不到策略”的不一致状态。

### 8.2 Recovery Packet 不应单独存成真相源

`recovery_packet` 的来源应该是当前 goal + 最新 progress + 最新 failure + 当前 policy 的组合结果。

即使实现层面做缓存，它也不应成为唯一事实源。

### 8.3 Retry Guard 不应隐式修改业务状态

`retry_guard/check` 只负责判断，不负责：

- 创建 attempt
- 修改 policy
- 修改 goal

这样它才能保持可预测、可测试。

---

## 9. v0 范围内的非目标

以下内容不进入 v0 API 契约：

- 多用户认证
- 多 workspace 隔离
- 分页 cursor
- 批量写入
- Webhook
- SSE / streaming
- 异步 job queue
- 复杂搜索

v0 以：

- 单机
- 单用户
- 单 active goal
- 小规模历史

为默认前提。

---

## 10. 实现建议顺序

按这个契约，后续实现顺序建议是：

1. `POST /goals`
2. `GET /goals/current`
3. `POST /attempts`
4. `POST /reflections`
5. `GET /policies/current`
6. `POST /retry-guard/check`
7. `GET /recovery-packet`
8. `GET /health`

按照当前 baseline，`reflection_generate` 默认走 adapter / 本地纯函数路线，因此 service 可以不在第一阶段实现 `POST /reflections/generate`。

---

## 11. 当前结论

Goal Engine v0 的 API 契约必须服务于一个核心目标：

**让“失败后行为必须变化”从产品口号变成可调用、可验证、可测试的系统边界。**

因此这份 contract 的关键不是 endpoint 数量，而是三个硬点：

1. reflection 写入必须带来 policy 更新
2. retry guard 的结果必须是显式判断，而不是隐式提示
3. recovery packet 必须能在新 session 中独立恢复方向连续性
