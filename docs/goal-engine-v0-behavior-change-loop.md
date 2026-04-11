# Goal Engine v0: Behavior Change Loop

> 状态：可实施草案  
> 日期：2026-04-02  
> 目标：把“失败后行为必须发生变化”做成第一版可落地闭环

---

## 1. 这份文档解决什么问题

当前我们已经确认一件事：

**只有长期记忆，不等于 Agent 会自动进化。**

问题不在于“有没有保存历史”，而在于：

1. 失败有没有被结构化记录
2. 失败有没有被转成下一轮策略
3. 下一轮是否真的被约束成与上一轮不同

这份文档的目标不是讨论“专家化”愿景，而是定义一个第一版可做、可测、可验证的闭环：

**每次失败后，下一轮行为必须发生可验证变化。**

---

## 2. v0 的产品目标

Goal Engine v0 不追求：

- 自动进化成专家
- 自动学习新通用能力
- 自主形成长期人格
- 全自动多 Agent 协同进化

Goal Engine v0 只追求四个结果：

1. 失败后不直接停住
2. 失败后必须留下结构化记录
3. 下一轮必须读取上一轮策略结果
4. 下一轮不能无条件重复上一轮方法

一句话：

**v0 的目标不是“让 Agent 更聪明”，而是“让 Agent 更少重复同样错误”。**

---

## 3. 最小闭环

v0 的最小行为变化闭环是：

```text
attempt
  -> failure classification
  -> reflection
  -> policy update
  -> retry guard
  -> next attempt
```

这个闭环里最关键的不是 `reflection`，而是：

**policy update + retry guard**

因为只有当上一轮经验真的限制了下一轮动作，系统才不只是“会写复盘”。

---

## 4. 五个核心模块

### 4.1 Attempt Recorder

负责记录每一轮尝试。

最小职责：

- 保存当前目标和阶段
- 保存本轮做了什么
- 保存结果
- 保存失败类型
- 保存下一轮假设

如果没有它，后续所有“进化”都只是感受，不是结构化状态。

### 4.2 Reflection Worker

负责在失败后生成短反思。

最小输出：

- 本轮主要失败原因
- 错误属于哪一类
- 下一轮必须改变什么
- 哪种方法短期内禁止重复

v0 不需要长篇反思，不需要复杂哲学总结，只需要为下一轮动作服务。

### 4.3 Policy Builder

负责把反思转成可执行策略。

最小职责：

- 生成当前有效 policy
- 标记 `avoid_strategy`
- 标记 `preferred_next_step`
- 标记 `must_check_before_retry`

这里是“记忆”变成“规则”的关键点。

### 4.4 Retry Guard

负责在下一轮开始前检查是否允许直接重试。

这是 v0 最关键的执行门。

它至少要检查：

- 当前计划是否和上一轮高度重复
- 当前 policy 是否已被读取
- 当前动作是否命中禁止重复规则

如果命中，系统不能让 Agent 直接继续老路径。

### 4.5 Recovery Packet Builder

负责生成新 session 所需的最小恢复包。

它的职责是：

- 不让系统依赖长会话
- 不让行为变化闭环只在单一 session 内成立

---

## 5. 最小对象模型

v0 只需要五个核心对象。

### 5.1 Goal

```ts
type Goal = {
  id: string;
  title: string;
  status: 'active' | 'blocked' | 'completed' | 'abandoned';
  currentStage: string;
  successCriteria: string[];
  updatedAt: string;
};
```

### 5.2 Attempt

```ts
type Attempt = {
  id: string;
  goalId: string;
  stage: string;
  actionTaken: string;
  result: 'success' | 'partial' | 'failure';
  failureType?: string;
  confidence?: number;
  nextHypothesis?: string;
  createdAt: string;
};
```

### 5.3 Reflection

```ts
type Reflection = {
  id: string;
  goalId: string;
  attemptId: string;
  summary: string;
  rootCause: string;
  mustChange: string;
  avoidStrategy?: string;
  createdAt: string;
};
```

### 5.4 Policy

```ts
type Policy = {
  id: string;
  goalId: string;
  preferredNextStep?: string;
  avoidStrategies: string[];
  mustCheckBeforeRetry: string[];
  updatedAt: string;
};
```

### 5.5 Recovery Packet

```ts
type RecoveryPacket = {
  goalId: string;
  currentStage: string;
  successCriteria: string[];
  lastMeaningfulProgress?: string;
  lastFailureSummary?: string;
  avoidStrategies: string[];
  preferredNextStep?: string;
  generatedAt: string;
};
```

---

## 6. v0 的触发时机

### 6.1 尝试结束后

无论成功还是失败，都必须写 `Attempt`。

### 6.2 失败后

如果 `Attempt.result = failure`，则必须：

1. 生成 `Reflection`
2. 更新 `Policy`
3. 刷新 `Recovery Packet`

### 6.3 下一轮开始前

必须执行：

1. 读取 `Goal`
2. 读取当前 `Policy`
3. 运行 `Retry Guard`

### 6.4 新 session 开始前

必须加载：

- `Recovery Packet`
- 当前有效 `Policy`

而不是把完整历史重新塞进上下文。

---

## 7. Retry Guard 的最小规则

v0 不需要复杂评分器，但必须有三条硬规则。

### 7.1 禁止无差异重试

如果本轮计划与上一轮失败动作高度相似，且没有新的输入、工具或分解方式，默认禁止直接重试。

### 7.2 禁止跳过 policy

如果 Agent 准备继续行动，但本轮还没有读取当前 `Policy`，默认不通过。

### 7.3 卡住时必须降维

若同类失败连续出现，下一轮必须至少发生一种变化：

- 更小的子任务
- 新工具
- 新输入材料
- 新搜索路径
- 请求外部帮助

如果没有变化，不允许继续原方法。

---

## 8. OpenClaw 里的落地方式

v0 先按 OpenClaw-native 路线落地。

### 8.1 本地 Agent 负责什么

- 执行当前动作
- 调用工具
- 产出 attempt 输入
- 读取当前恢复包与 policy

### 8.2 Goal Engine 控制层负责什么

- 存储 `Goal / Attempt / Reflection / Policy / Recovery Packet`
- 在失败后更新策略
- 在下一轮前做 retry guard
- 在新 session 前生成最小恢复包

### 8.3 OpenClaw 接入点

第一版优先用：

- `AGENTS.md`
  写长期行为原则
- `HEARTBEAT.md`
  写周期检查提示
- plugin tools
  供 Agent 读写 Goal Engine 状态
- hooks / 固定流程
  保证“失败后写回”和“重试前检查”不会被跳过

### 8.4 v0 不要求什么

第一版不要求：

- 深度模型训练
- 自动更新 `SOUL.md`
- 多 Agent 共用策略进化
- 通用跨平台适配层

---

## 9. 最小工具集

v0 最少需要 5 个工具。

### 9.1 `goal_get_current`

返回当前主目标与阶段。

### 9.2 `attempt_append`

写入一条结构化尝试记录。

### 9.3 `reflection_generate`

根据最近失败生成短反思。

### 9.4 `policy_get_current`

返回当前有效策略。

### 9.5 `retry_guard_check`

检查本轮计划是否允许继续。

如果后续要补第 6 个工具，优先是：

### 9.6 `recovery_packet_get`

为新 session 返回最小恢复包。

---

## 10. 两周内的可实施版本

### Week 1

目标：跑通记录与策略链路。

输出：

1. `Goal / Attempt / Reflection / Policy / Recovery Packet` 最小数据结构
2. `attempt_append`
3. `reflection_generate`
4. `policy_get_current`
5. 一个最小演示流程：
   `attempt -> reflection -> policy`

### Week 2

目标：让下一轮行为真的受上一轮影响。

输出：

1. `retry_guard_check`
2. `recovery_packet_get`
3. 一个新 session 恢复流程
4. 一个最小指标面板或日志统计：
   - 是否重复
   - 是否换策略
   - 是否继续推进

---

## 11. 验收标准

v0 是否成立，不看“像不像智能生命”，只看下面四条。

### 11.1 失败后行为是否真的改变

下一轮至少要有一种明确变化：

- 工具变了
- 子任务变了
- 输入材料变了
- 搜索路径变了
- 求助对象变了

### 11.2 新 session 后是否还能继续同一目标

如果开新 session，系统仍能通过恢复包继续推进，而不是重新开始。

### 11.3 重复错误率是否下降

不是绝对清零，而是比“无 policy / 无 retry guard”的基线更少。

### 11.4 放弃率是否下降

面对失败时，Agent 更少出现：

- 直接停住
- 改做无关事情
- 无差异重复

---

## 12. 明确不承诺的事

v0 当前不承诺：

- 自动进化成专家
- 自动学会新领域能力
- 普遍适用于所有 Agent 场景
- 一定显著降低所有模型成本

v0 只承诺：

**把“失败后行为必须变化”做成一个可执行、可观察、可验证的控制闭环。**

---

## 13. 当前结论

如果 Goal Engine 要从“长期记忆”真正走向“持续进化”，第一步不是做更大的 memory 系统，而是先做：

**Behavior Change Loop**

也就是：

- 失败被记录
- 失败被反思
- 反思被转成策略
- 策略在下一轮被强制执行

这是当前最小、最硬、最能落地的方向。
