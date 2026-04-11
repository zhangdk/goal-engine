# Goal Engine v0 Implementation Baseline

> 状态：实施前冻结基线  
> 日期：2026-04-03  
> 目标：在正式编码前，统一 Goal Engine v0 的关键实现决策，避免架构文档、API 契约、数据模型和实施计划在执行时各自漂移

---

## 1. 这份文档解决什么问题

当前 `goal-engine/` 已经有：

- PRD
- behavior loop
- architecture
- data model
- API contract
- OpenClaw integration
- 初版 implementation plan

这些文档的整体方向是一致的，但在真正开始实现前，仍有几类问题需要先定死：

1. 哪些能力是 service 必做，哪些只是 adapter 可选能力
2. 哪些字段必须枚举化，不能继续保持“自由文本”
3. `retry_guard` 到底按什么最小规则判断“行为发生变化”
4. 本地 projection 到底要投什么、何时刷新、谁负责生成
5. 实施顺序应该以什么模块为基线，避免先写脚手架后返工

这份文档的作用不是新增一套架构，而是为 v0 实施提供唯一执行基线。

---

## 2. 文档优先级

在 v0 实施阶段，文档优先级按下面顺序解释：

1. `goal-engine-v0-implementation-baseline.md`
2. `goal-engine-v0-architecture.md`
3. `goal-engine-v0-api-contract.md`
4. `goal-engine-v0-data-model.md`
5. `goal-engine-v0-openclaw-integration.md`
6. `goal-engine-v0-behavior-change-loop.md`
7. `goal-engine-prd.md`

解释原则：

- 如果已有文档在执行细节上不一致，以这份 baseline 为准
- 如果 baseline 未覆盖某个问题，则回到对应专题文档
- baseline 只收口实现决策，不替代 PRD 或架构说明

---

## 3. v0 必须锁定的实现边界

### 3.1 service 是事实源和规则执行层

service 必须负责：

- `Goal / Attempt / Reflection / Policy` 持久化
- reflection 写入后的 policy 更新
- retry guard 显式判断
- recovery packet 组装

service 不负责：

- Agent 当前轮推理
- 本地 prompt 组织
- 本地工具隐式状态缓存
- 把完整历史塞回 session

### 3.2 agent-adapter 是调用层，不是业务层

adapter 只负责：

- HTTP client 封装
- snake_case <-> camelCase 映射
- envelope / error 标准化
- 暴露给 OpenClaw 的工具函数

adapter 不负责：

- policy 业务判断
- retry guard 业务判断
- recovery packet 生成

### 3.3 本地文件只允许保留 projection

本地投影文件只允许保留：

- 当前 goal 摘要
- 当前 stage
- success criteria 摘要
- 最近失败摘要
- 当前 `avoid_strategies`
- 当前 `preferred_next_step`

本地文件不能作为：

- attempts 真相源
- reflections 真相源
- policies 历史存储

---

## 4. v0 冻结的字段语义

### 4.1 `failure_type` 使用固定枚举

v0 冻结为以下 8 个值：

```ts
type FailureType =
  | 'tool_error'
  | 'capability_gap'
  | 'strategy_mismatch'
  | 'external_blocker'
  | 'resource_limit'
  | 'validation_fail'
  | 'stuck_loop'
  | 'ambiguous_goal';
```

要求：

- `attempt.result = failure` 时必须填写
- service validator 必须按枚举校验
- repository / tests / adapter 必须共享同一语义

### 4.2 `strategy_tags` 是行为路径标签，不是自由注释

`strategy_tags` 的用途不是描述所有细节，而是为 retry guard 提供可比较信号。

v0 规则：

- 必须是字符串数组
- 应优先标识“方法路径”，而不是结果描述
- 允许重复使用稳定标签，例如：
  - `broad-web-search`
  - `official-docs`
  - `narrowed-scope`
  - `ask-human`
  - `smaller-subtask`

### 4.3 `avoid_strategy` 是单次 reflection 输出，`avoid_strategies` 是当前 policy 聚合结果

要求：

- reflection 里最多输出一个 `avoid_strategy`
- policy 里保存去重后的 `avoid_strategies[]`
- policy update 必须是幂等合并，不得产生重复标签

---

## 5. `reflection_generate` 的归属决策

### 5.1 v0 默认决策

`reflection_generate` 在 v0 默认归属 `agent-adapter` / OpenClaw 本地侧。

也就是说：

- 它是 v0 的必备工具能力
- 但不是 service 的必备 HTTP route

### 5.2 service 侧决策

service v0 的强制接口是：

- `POST /api/v1/goals`
- `GET /api/v1/goals/current`
- `PATCH /api/v1/goals/:goalId`
- `POST /api/v1/attempts`
- `GET /api/v1/attempts`
- `POST /api/v1/reflections`
- `GET /api/v1/policies/current`
- `POST /api/v1/retry-guard/check`
- `GET /api/v1/recovery-packet`
- `GET /api/v1/health`

`POST /api/v1/reflections/generate` 在 v0 是可选 route。

### 5.3 实施含义

初版实现应按下面顺序理解：

- service 必须接受“已经生成好的 reflection payload”
- adapter 可以本地提供一个 `reflection_generate` helper
- 如果后续发现服务端集中生成更合理，再单独升级 route

这样做的原因是：

- 不把 service 绑死在生成式能力上
- 保持 service 作为规则和事实源的边界稳定
- 让 v0 先验证闭环，而不是先验证生成质量

---

## 6. `retry_guard` 的最小可测试规则

### 6.1 目标

v0 的 retry guard 必须是：

- 显式
- 可解释
- 可单测

它不是“智能评分器”，而是最小执行门。

### 6.2 输入基线

`POST /retry-guard/check` 请求体在 v0 采用：

```json
{
  "goal_id": "goal_123",
  "planned_action": "Search broad web for more vendors",
  "what_changed": "Switch to three official vendor docs only",
  "strategy_tags": ["official-docs", "narrowed-scope"],
  "policy_acknowledged": true
}
```

### 6.3 允许通过的前提

至少同时满足：

1. `policy_acknowledged = true`
2. 未命中当前 policy 的 `avoid_strategies`
3. 对比最近失败 attempt，存在最小行为变化

### 6.4 v0 的“最小行为变化”定义

只要满足以下任一项，即视为发生了最小行为变化：

- `strategy_tags` 出现新的方法标签
- `what_changed` 明确声明切换到更小子任务
- `what_changed` 明确声明切换到新工具
- `what_changed` 明确声明引入新输入材料
- `what_changed` 明确声明切换到新搜索路径
- `what_changed` 明确声明请求外部帮助

### 6.5 v0 的阻断规则

出现以下任一项，应返回 `allowed = false`：

1. `policy_acknowledged = false`
2. `strategy_tags` 与 `avoid_strategies` 存在交集
3. 最近一次失败 attempt 与当前 `strategy_tags` 高度重合，且 `what_changed` 为空或等价于“无变化”
4. 同类失败连续出现时，当前输入仍未体现上述五类变化之一

### 6.6 “高度相似”的 v0 实现定义

v0 不做 embedding 相似度，不做 LLM 判断。

直接用可解释启发式：

- 若当前 `strategy_tags` 与最近失败 attempt 的 `strategy_tags` 完全相同，则视为高度相似
- 若当前 `strategy_tags` 非空，且交集比例 `>= 0.7`，同时 `what_changed` 不构成明确变化，也视为高度相似

### 6.7 建议的阻断原因枚举

v0 建议将 `reason` 收敛为以下值：

```ts
type RetryGuardReason =
  | 'allowed'
  | 'policy_not_acknowledged'
  | 'blocked_strategy_overlap'
  | 'no_meaningful_change'
  | 'repeated_failure_without_downgrade';
```

---

## 7. Recovery Packet 的冻结语义

### 7.1 来源

`RecoveryPacket` 是派生视图，来自：

- 当前 goal
- 最近 meaningful progress
- 最近失败摘要
- 当前 policy

### 7.2 v0 最小字段

```ts
type RecoveryPacket = {
  goalId: string;
  goalTitle: string;
  currentStage: string;
  successCriteria: string[];
  lastMeaningfulProgress?: string;
  lastFailureSummary?: string;
  avoidStrategies: string[];
  preferredNextStep?: string;
  generatedAt: string;
};
```

### 7.3 生成规则

v0 必须保证：

- 每次读取都可从事实源重建
- 不依赖单独持久化 recovery table
- 新 session 只需 `recovery packet + current policy` 即可继续

---

## 8. 本地 projection 契约

### 8.1 推荐文件

```text
goal-engine/
  current-goal.md
  current-policy.md
  recovery-packet.md
```

### 8.2 刷新时机

以下时机必须刷新：

1. 新 session 开始前
2. policy 更新后
3. current stage 变化后
4. recovery packet 重新生成后

### 8.3 一致性要求

projection 必须满足：

- 内容来自 service 当前状态
- 不得手工演化为另一套真相
- summary file 与 hook 注入文本必须表达同一内容

---

## 9. 测试与实施顺序基线

### 9.1 先测规则层，再测接口层

v0 实施顺序冻结为：

1. shared types / enums
2. SQLite schema + repositories
3. `policy service`
4. `retry guard service`
5. `recovery packet builder`
6. HTTP routes
7. adapter client / tools
8. OpenClaw projection files and hook integration

### 9.2 最小测试矩阵

在开始实施前，至少要覆盖：

1. unit: policy merge
2. unit: retry guard reasons
3. unit: recovery packet composition
4. integration: `attempt -> reflection -> policy`
5. integration: `policy -> retry guard`
6. integration: `goal + policy + history -> recovery packet`
7. e2e-style flow: create goal -> fail -> reflect -> retry blocked -> change strategy -> continue

### 9.3 文档先于代码的原则

在 v0 阶段，如果出现以下情况，应先改文档再写代码：

- 发现某个枚举值尚未冻结
- 发现 service / adapter 边界不清
- 发现 route 是否 mandatory 仍有争议
- 发现 retry guard 规则无法直接写断言

---

## 10. 当前结论

Goal Engine v0 现在可以进入实施，但前提不是“文档够多”，而是以下几点已经冻结：

- `failure_type` 是固定枚举
- `reflection_generate` 默认属于 adapter 能力
- `retry_guard` 用启发式硬规则实现，不依赖黑盒判断
- `RecoveryPacket` 是派生视图，不是新真相源
- 本地只保留 projection，不承载事实库

后续实现必须优先服务这个基线，而不是在编码过程中继续重新发明 v0 的边界。
