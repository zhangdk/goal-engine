# Goal Engine 观测执行记录

**日期：** 2026-04-07  
**执行人：** Codex  
**执行方式：** 按《Goal Engine 体验馆观测执行手册》实跑  
**目标任务：** 完成 Goal Engine 体验馆观测手册验收

---

## 1. 本次执行目标

本次不是做接口验收，而是按体验馆方式跑一条真实目标链路，并同时观察：

- OpenClaw 对话面是否可用
- Goal Engine 显式入口是否能形成闭环
- UI 是否能解释 Agent 的学习与进化证据
- token 控制是否符合“最小恢复包”原则

本次采用的真实目标是：

**完成 Goal Engine 体验馆观测手册验收**

成功标准：

- 生成一份普通用户可读的详细执行手册
- 手册已加入 docs 索引
- 能说明 OpenClaw + UI + token 控制的观测方法

---

## 2. 执行路径

### 2.1 环境与入口确认

已确认：

- `openclaw --version` 可用
- `openclaw plugins inspect goal-engine` 显示插件 `Status: loaded`
- Goal Engine 6 个工具可见
- `http://127.0.0.1:3100/api/v1/health` 返回正常

结论：

- OpenClaw 和 Goal Engine 插件已加载
- service 在 `3100` 已运行

### 2.2 最小上下文建立

执行：

- `pnpm openclaw bootstrap`
- `pnpm openclaw entrypoint "show goal status"`

结果：

- bootstrap 返回“当前没有 active goal”
- `show goal status` 同样返回“当前没有 active goal”

结论：

- 体验从空状态开始，符合手册预期

### 2.3 OpenClaw 本地 agent 对话尝试

执行：

- `openclaw agent --local --json --session-id goal-engine-observer-001 --message "..."`

目标：

- 让 OpenClaw agent 先 bootstrap，再读取当前状态，并说明如何开始真实任务体验

实际结果：

- agent 能看到并注册 Goal Engine 插件
- 但 `goal_engine_bootstrap` 和 `goal_engine_show_goal_status` 工具调用失败

暴露问题：

- OpenClaw 对话面存在真实执行缺口
- 插件对话链不能稳定完成最小 Goal Engine 引导

处理方式：

- 按执行手册切到备用路径：显式入口 + UI 证据面

### 2.4 创建真实目标

执行：

```bash
cd agent-adapter
pnpm openclaw entrypoint "start goal" --payload '{
  "title":"完成 Goal Engine 体验馆观测手册验收",
  "successCriteria":[
    "生成一份普通用户可读的详细执行手册",
    "手册已加入 docs 索引",
    "能说明 OpenClaw + UI + token 控制的观测方法"
  ],
  "currentStage":"observer-validation"
}'
```

结果：

- 返回 `Goal started`
- 阶段为 `observer-validation`

### 2.5 状态一致性复核

紧接着执行：

- `pnpm openclaw entrypoint "show goal status"`

结果：

- 仍返回“没有 active goal”

进一步用 service 事实源核对：

- `GET /api/v1/goals/current` 返回 active goal
- `GET /api/v1/ui/agents` 显示 `goal-engine-demo` 已挂上当前目标

结论：

- `start goal` 写入成功
- `show goal status` 读取链路与 service 事实源不一致
- 这是体验中真实暴露出的状态一致性问题

### 2.6 失败写回与学习链路

第一次尝试使用：

- `failureType=integration_gap`

结果：

- 校验失败

进一步检查后发现：

- `record failed attempt` 只接受固定枚举
- 合法枚举包括：`tool_error`、`stuck_loop`、`validation_fail` 等

修正后执行：

```bash
pnpm openclaw entrypoint "record failed attempt" --payload '{
  "stage":"observer-validation",
  "actionTaken":"Tried the OpenClaw local agent path, but the plugin tool call failed and the status path became inconsistent.",
  "strategyTags":["openclaw-local-agent","status-read-mismatch"],
  "failureType":"tool_error"
}'
```

结果：

- 失败记录成功
- guidance 更新成功
- 新 guidance：
  - `Next step: 切换到其他工具或更小范围的操作`
  - `Avoid: openclaw-local-agent`

结论：

- 失败写回链路成立
- 反思与 policy 更新由系统自动生成

### 2.7 重试阻断

执行：

```bash
pnpm openclaw entrypoint "check retry" --payload '{
  "plannedAction":"Use the same broken OpenClaw local agent path again without a new verification strategy.",
  "whatChanged":"",
  "strategyTags":["openclaw-local-agent","status-read-mismatch"],
  "policyAcknowledged":true
}'
```

结果：

- `Retry check: blocked`
- `rawReason: blocked_strategy_overlap`

结论：

- 重复路径被明确阻断
- Goal Engine 已经从“记录失败”推进到“限制下一轮重复错误”

### 2.8 UI 证据面复核

检查：

- `GET /api/v1/ui/agents/goal-engine-demo`
- `GET /ui/agents/goal-engine-demo`

关键结果：

- `overall`: `partial`
- `behavior_changed`: `partial`
- `repeat_errors_reduced`: `partial`
- `memory_preserved`: `yes`

timeline 中已出现：

- `failure`
- `reflection`
- `policy_update`
- `retry_check`
- `recovery`

current state 中已出现：

- 当前 guidance：`切换到其他工具或更小范围的操作`
- avoid strategies：`openclaw-local-agent`

结论：

- UI 已经能解释“Agent 为什么发生变化”
- 不是只有恢复证据，而是已有失败学习与重试阻断证据

### 2.9 projection 与 token 控制复核

检查：

- `examples/workspace/goal-engine/current-goal.md`
- `examples/workspace/goal-engine/current-policy.md`
- `examples/workspace/goal-engine/recovery-packet.md`

结果：

- projection 文件保持摘要化
- 不包含完整历史 dump
- 已包含最小恢复包所需信息：
  - 当前 goal
  - 当前阶段
  - 最近失败摘要
  - 当前禁止策略
  - 推荐下一步

结论：

- token 控制方向符合产品要求
- 当前恢复摘要可支持新 session 继续，而不必重贴长对话历史

### 2.10 恢复入口复核

执行：

- `pnpm openclaw entrypoint "recover current goal"`

结果：

- CLI 报错：`Unexpected token 'I', "Internal S"... is not valid JSON`

进一步检查：

- `GET /api/v1/recovery-packet?goal_id=...` 正常返回 JSON
- projection 文件也已正确刷新

结论：

- 恢复 API 本身可用
- `recover current goal` 的 CLI / adapter 链路存在异常
- 这是第二个明确的体验缺口

---

## 3. 最终观察结果

## 3.1 结果结论

**部分成功**

原因：

- 目标本身已完成，手册和索引都存在
- Goal Engine 的失败学习、策略更新、重试阻断、UI 证据链都跑通了
- 但 OpenClaw 对话面与恢复入口仍存在执行缺口

## 3.2 进化结论

**有明确变化，但还不是稳定闭环**

原因：

- 第一阶段只有 recovery 证据
- 在显式失败写回后，系统生成了新的 guidance
- 对重复旧路径的尝试给出了明确 block
- UI 能解释这次变化

这证明：

- Agent 没有只是“记住失败”
- 系统已经把失败转成了下一轮约束

## 3.3 产品结论

**Goal Engine 在“失败学习 + 防重复 + 证据可见”上已证明方向成立，但在 OpenClaw 原生执行面上还没有形成稳定无断点体验。**

---

## 4. 本次执行暴露出的主要问题

### 4.1 OpenClaw 本地 agent 对话链不稳定

表现：

- `goal_engine_bootstrap` / `goal_engine_show_goal_status` 工具在本地 agent turn 中调用失败

影响：

- 观测者无法只靠 OpenClaw 对话面完成完整体验

### 4.2 `show goal status` 与 service 事实源不一致

表现：

- `start goal` 成功后
- `show goal status` 仍报告没有 active goal

影响：

- 观测者无法信任 OpenClaw 状态读取结果

### 4.3 `recover current goal` 入口异常

表现：

- recovery API 可用
- 但 CLI 入口报 JSON 解析错误

影响：

- 跨 session 恢复体验不稳定

### 4.4 文档与真实入口校验之间存在差距

表现：

- 用户指南示例没有明确强调 `failureType` 必须来自固定枚举

影响：

- 普通用户容易在第一次失败写回时撞到校验错误

---

## 5. 本次执行证明了什么

这次实跑证明了 4 件事：

1. Goal Engine 不只是“会记录失败”
2. 它已经能把失败转成 guidance 和 avoid strategy
3. retry guard 已经能阻断重复旧路径
4. UI 已经能把这条学习链解释成可观察证据

---

## 6. 本次执行还没有证明什么

这次还不能证明：

1. OpenClaw 原生对话面已经稳定可用
2. `show goal status` 的读取路径足够可靠
3. `recover current goal` 的完整体验已经稳定
4. 普通用户不经指导就能顺畅跑通全部链路

---

## 7. 下一步建议

下一阶段最该优先做的不是再扩更多能力，而是把下面 3 个缺口收敛掉：

1. 修复 OpenClaw 本地 agent 对话中的 Goal Engine 工具调用
2. 修复 `start goal` 后 `show goal status` 的状态一致性问题
3. 修复 `recover current goal` 的 CLI / adapter JSON 解析异常

在这 3 项稳定前，当前最可靠的体验路径仍然是：

**显式入口 + service 事实源 + UI 证据面**

而不是完全依赖 OpenClaw 原生对话面。
