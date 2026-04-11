# Goal Engine v0 Test Strategy

> 状态：实施前测试基线  
> 日期：2026-04-03  
> 目标：把 Goal Engine v0 的行为闭环翻译成可执行的 TDD 测试矩阵、验收标准和实现顺序

---

## 1. 文档目的

这份文档回答三个问题：

1. v0 到底先测什么
2. 每个模块应该用什么测试类型验证
3. 什么情况下才算“失败后行为必须变化”的闭环成立

它不替代：

- 架构文档
- API 契约
- 数据模型
- implementation baseline

它的作用是把这些文档里的约束翻译成测试优先的执行入口。

---

## 2. 测试原则

### 2.1 先测规则，再测接口

v0 的核心风险不在 HTTP 路由，而在规则语义是否稳定。

因此测试顺序必须是：

1. shared types / enums
2. policy merge logic
3. retry guard logic
4. recovery packet composition
5. repositories
6. routes
7. adapter tools
8. OpenClaw projection integration

### 2.2 只测可观察行为

测试应优先验证：

- 输入是否合法
- 状态有没有正确落盘
- policy 有没有被正确更新
- retry guard 有没有正确阻断
- recovery packet 能不能支撑新 session 恢复

而不是测试：

- 内部 helper 的实现细枝末节
- prompt 文案风格
- 非必要中间结构

### 2.3 黑盒判断不进入 v0

以下内容不应成为 v0 测试前提：

- embedding 相似度
- LLM 主观评分
- 黑盒“像不像发生了变化”

v0 必须建立在可解释断言上。

---

## 3. 测试层次

### 3.1 Unit Tests

必须覆盖：

- `FailureType` 和 `RetryGuardReason` 枚举
- `policy service` 的合并和幂等逻辑
- `retry guard service` 的阻断原因判断
- `recovery service` 的派生组装逻辑
- 各 validator 的字段约束

### 3.2 Integration Tests

必须覆盖：

- `POST /attempts`
- `POST /reflections` 触发 policy upsert
- `GET /policies/current`
- `POST /retry-guard/check`
- `GET /recovery-packet`

### 3.3 Adapter Tests

必须覆盖：

- snake_case 到 camelCase 映射
- envelope / error 处理
- `reflection_generate` 的本地 helper 输出结构
- service 返回 `404 / 409 / 422 / 500` 时 adapter 的行为

### 3.4 End-to-End Style Flow Tests

必须覆盖最小闭环：

1. 创建 goal
2. 记录失败 attempt
3. 提交 reflection
4. 生成 policy
5. 同策略重试被 retry guard 阻断
6. 换策略后允许继续
7. 生成 recovery packet

---

## 4. 用户旅程

### 4.1 旅程 A：失败后形成新策略

As an OpenClaw agent, I want a failed attempt to produce a structured policy update, so that the next run does not repeat the same method blindly.

### 4.2 旅程 B：重试前必须经过执行门

As an OpenClaw agent, I want retry guard to explicitly block low-quality retries, so that repeated mistakes are reduced.

### 4.3 旅程 C：新 session 也能继续同一目标

As an OpenClaw agent, I want a recovery packet to restore the minimum actionable context, so that a new session can continue without replaying the whole history.

### 4.4 旅程 D：本地只看投影，不直接依赖完整历史

As an OpenClaw integration layer, I want local summary files to stay as projections only, so that service remains the single source of truth.

---

## 5. 核心测试矩阵

### 5.1 Types / Enums

#### Test: `FailureType` is frozen

断言：

- 恰好包含 8 个枚举值
- `attempt.result = failure` 时只接受这 8 个值

#### Test: `RetryGuardReason` is frozen

断言：

- 只接受以下值：
  - `allowed`
  - `policy_not_acknowledged`
  - `blocked_strategy_overlap`
  - `no_meaningful_change`
  - `repeated_failure_without_downgrade`

### 5.2 Policy Service

#### Test: creates a policy from first reflection

断言：

- 首次 reflection 写入后创建 policy
- `avoid_strategy` 被收进 `avoid_strategies`
- `must_check_before_retry` 有最小默认值

#### Test: merges repeated `avoid_strategy` idempotently

断言：

- 重复 reflection 不会产生重复标签

#### Test: updates preferred next step from latest reflection

断言：

- 最新 reflection 的 `must_change` 能驱动 `preferred_next_step`

### 5.3 Retry Guard Service

#### Test: blocks when policy is not acknowledged

输入：

- `policy_acknowledged = false`

断言：

- `allowed = false`
- `reason = policy_not_acknowledged`

#### Test: blocks when strategy overlaps blocked policy

输入：

- `strategy_tags` 与 `avoid_strategies` 有交集

断言：

- `allowed = false`
- `reason = blocked_strategy_overlap`

#### Test: blocks when nothing meaningful changed

输入：

- 当前标签与最近失败 attempt 高度相似
- `what_changed` 为空或等价于“无变化”

断言：

- `allowed = false`
- `reason = no_meaningful_change`

#### Test: blocks repeated same failure without downgrade

输入：

- 同类失败连续发生
- 当前输入未体现更小子任务 / 新工具 / 新输入 / 新搜索路径 / 外部帮助

断言：

- `allowed = false`
- `reason = repeated_failure_without_downgrade`

#### Test: allows retry when meaningful change exists

输入：

- `policy_acknowledged = true`
- 未命中 `avoid_strategies`
- `what_changed` 明确体现降维或换路径

断言：

- `allowed = true`
- `reason = allowed`

### 5.4 Recovery Service

#### Test: composes packet from goal + policy + recent history

断言：

- 返回 `goal_id / goal_title / current_stage / success_criteria`
- 包含最近失败摘要
- 包含当前 `avoid_strategies`
- 包含 `preferred_next_step`

#### Test: packet is derived, not standalone truth

断言：

- 更改 policy 后重新读取 recovery packet，结果同步变化

### 5.5 Repositories

#### Test: only one active goal exists

断言：

- 当已存在 active goal 时，再建 active goal 返回冲突

#### Test: one attempt maps to at most one reflection

断言：

- 同一 `attempt_id` 第二次创建 reflection 返回冲突

#### Test: one goal maps to one current policy

断言：

- policy 对 `goal_id` 唯一

---

## 6. Route-level Contract Tests

### 6.1 `POST /api/v1/goals`

断言：

- 合法请求返回 `201`
- 已有 active goal 时返回 `409 state_conflict`

### 6.2 `GET /api/v1/goals/current`

断言：

- 有 active goal 时返回 `200`
- 没有时返回 `404 no_active_goal`

### 6.3 `POST /api/v1/attempts`

断言：

- `result = failure` 时 `failure_type` 必填
- `strategy_tags` 必须是数组

### 6.4 `POST /api/v1/reflections`

断言：

- 写入 reflection 后同步返回 updated policy
- 重复 `attempt_id` 返回 `409 duplicate_reflection`

### 6.5 `GET /api/v1/policies/current`

断言：

- 当前无 policy 时返回 `404 no_policy_yet`

### 6.6 `POST /api/v1/retry-guard/check`

断言：

- 阻断场景仍返回 `200`
- `data.allowed = false`

### 6.7 `GET /api/v1/recovery-packet`

断言：

- 有足够状态时返回 `200`
- 目标不存在返回 `404`

---

## 7. Adapter Test Matrix

### 7.1 `goal_get_current`

断言：

- 能把 snake_case 响应映射成 camelCase 对象

### 7.2 `attempt_append`

断言：

- 能正确序列化 `strategyTags -> strategy_tags`

### 7.3 `reflection_generate`

断言：

- 作为本地 helper 存在
- 输出结构至少包含：
  - `summary`
  - `rootCause`
  - `mustChange`
  - `avoidStrategy`

### 7.4 `policy_get_current`

断言：

- `404 no_policy_yet` 能被映射成稳定错误对象

### 7.5 `retry_guard_check`

断言：

- `allowed = false` 被保留为正常业务结果，不抛异常

### 7.6 `recovery_packet_get`

断言：

- 返回 camelCase 的 `generatedAt`

---

## 8. Projection / Integration Tests

v0 不需要完整 OpenClaw e2e，但至少要有投影一致性测试。

### 8.1 Projection refresh after policy update

断言：

- policy 更新后，`current-policy.md` 投影内容同步更新

### 8.2 Projection refresh on new session

断言：

- 新 session 启动时，通过 `recovery_packet_get + policy_get_current` 能重建最小投影

### 8.3 Projection never stores full history

断言：

- projection 文件中不落全量 attempts / reflections / policy history

---

## 9. 验收标准

v0 可以进入“开始编码”阶段的前提是：

1. 每个核心模块都有明确单测入口
2. `retry_guard` 的阻断原因可以直接写断言
3. `reflection_generate` 的归属已冻结为 adapter helper
4. projection 契约已从事实源分离

v0 可以进入“闭环成立”状态的前提是：

1. 失败后能生成 reflection 和 policy
2. 同路径重试会被显式阻断
3. 改路径后能重新通过 guard
4. 新 session 能通过 recovery packet 继续

---

## 10. 推荐执行顺序

### Phase 0: 文档冻结

- baseline
- test strategy
- implementation plan

### Phase 1: 规则层 TDD

- types
- policy service
- retry guard service
- recovery service

### Phase 2: 持久化与接口

- schema
- repositories
- routes

### Phase 3: Adapter 与本地投影

- adapter client
- adapter tools
- projection refresh helpers

---

## 11. 当前结论

Goal Engine v0 的第一轮 TDD 不应该从“先把服务跑起来”开始，而应该从“先把闭环规则写成失败的测试”开始。

只有当下面三件事先被测试化，后续实现才不会漂：

- failure 的结构化分类
- retry guard 的显式阻断语义
- recovery packet 的派生与恢复能力
