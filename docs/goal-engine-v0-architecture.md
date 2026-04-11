# Goal Engine v0 Architecture

> 状态：可实施草案  
> 日期：2026-04-03  
> 目标：定义 Goal Engine v0 的模块边界、运行时分工、关键数据流与最小部署形态

---

## 1. 文档目的

这份文档回答的是：

**Goal Engine v0 应该如何在系统层落地，哪些模块存在，谁负责什么，数据如何流动。**

它不替代：

- 产品 PRD
- API Contract
- 数据库 schema

它的作用是让后续实现保持同一个架构边界，不在开发过程中不断漂移。

如果实现阶段需要更细的冻结决策，以 `goal-engine-v0-implementation-baseline.md` 为执行基线。

---

## 2. 架构目标

v0 架构只服务一个核心目标：

**让“失败后行为必须变化”形成可执行闭环。**

因此架构必须满足四个条件：

1. 失败后的状态必须被结构化记录
2. 记录必须能转成策略
3. 策略必须在下一轮被读取和检查
4. 新 session 必须能通过最小恢复包继续推进

---

## 3. 系统边界

Goal Engine v0 包含两个主要运行单元：

1. **service**
   一个最小后端控制层，负责长期状态、策略更新、恢复包和 retry guard。

2. **agent-adapter**
   一个供本地 Agent 调用的适配层，负责把 Goal Engine 的 HTTP contract 封装成可用工具。

本地 OpenClaw Agent 不是 Goal Engine 的一部分，但它是 Goal Engine 的主要消费者。

---

## 4. 顶层架构

```text
OpenClaw Agent
  -> agent-adapter tools
    -> Goal Engine service
      -> storage
      -> policy engine
      -> retry guard
      -> recovery packet builder
```

### 4.1 本地 Agent

负责：

- 具体行动
- 工具调用
- 本轮上下文推理
- 在失败后触发 Goal Engine 写回

它不负责：

- 长期历史存储
- policy 生成
- recovery packet 组装
- retry guard 规则判断

### 4.2 agent-adapter

负责：

- 将 HTTP API 封装成稳定工具
- 统一字段映射
- 统一错误处理
- 为 OpenClaw 集成提供最小调用层

它不负责：

- 保存长期状态
- 编排业务策略
- 替服务端做业务规则判断

### 4.3 service

负责：

- 存储 `Goal / Attempt / Reflection / Policy`
- 在 reflection 写入后更新 policy
- 在下一轮前判断 retry guard
- 组装 recovery packet

它不负责：

- 执行 Agent 任务
- 直接控制模型推理
- 替 Agent 生成完整行为计划

---

## 5. 模块边界

### 5.1 service 内部模块

v0 服务端推荐分成这 6 层。

#### 5.1.1 routes

职责：

- 接收 HTTP 请求
- 调用校验器
- 组装响应 envelope

不负责：

- 业务判断
- 数据库存取细节

#### 5.1.2 validators

职责：

- 校验 request body / query
- 统一字段约束

不负责：

- 存储
- 策略生成

#### 5.1.3 repositories

职责：

- 读写数据库
- 以资源粒度提供 CRUD/查询能力

建议存在：

- `goal.repository`
- `attempt.repository`
- `reflection.repository`
- `policy.repository`

不负责：

- policy 业务规则
- retry 业务判断

#### 5.1.4 policy engine

职责：

- 根据 reflection 更新或创建 policy
- 合并 `avoid_strategies`
- 生成 `preferred_next_step`
- 生成 `must_check_before_retry`

这是“记忆”转成“规则”的核心模块。

#### 5.1.5 retry guard

职责：

- 读取当前 policy
- 比对 planned action 与禁止策略
- 判断是否允许继续

这是“规则”转成“执行门”的核心模块。

#### 5.1.6 recovery packet builder

职责：

- 从 goal、policy、最近进展、最近失败中组装恢复包
- 面向新 session 提供最小恢复状态

它不应成为唯一事实源，只是组合视图。

### 5.2 agent-adapter 内部模块

#### 5.2.1 config

负责：

- Goal Engine 服务地址
- future auth header 配置

#### 5.2.2 client

负责：

- GET/POST/PATCH 请求封装
- 统一 envelope 解析
- 统一错误对象

#### 5.2.3 tools

负责：

- 导出 Agent 可直接调用的工具函数

包括：

- `goal_get_current`
- `attempt_append`
- `reflection_generate`
- `policy_get_current`
- `retry_guard_check`
- `recovery_packet_get`

---

## 6. 关键数据流

### 6.1 数据流 A：失败后策略更新

这是 v0 最核心的数据流。

```text
Agent attempt failed
  -> adapter calls POST /attempts
  -> adapter/service gets reflection content
  -> POST /reflections
  -> policy engine updates current policy
  -> next run reads policy
```

关键约束：

- `POST /reflections` 不能只写 reflection
- 它必须同步产出 policy 更新结果

### 6.2 数据流 B：下一轮重试前检查

```text
Agent prepares next action
  -> adapter calls GET /policies/current
  -> adapter calls POST /retry-guard/check
  -> guard returns allowed / blocked
  -> Agent proceeds or changes plan
```

关键约束：

- `retry_guard/check` 只判断，不修改状态
- `allowed = false` 返回 200，不是服务错误

### 6.3 数据流 C：新 session 恢复

```text
New session starts
  -> adapter calls GET /recovery-packet
  -> Agent loads recovery packet + current policy
  -> continues same goal with minimal context
```

关键约束：

- 恢复包不是完整历史
- 恢复包必须可独立指导下一轮启动

---

## 7. OpenClaw 接入架构

### 7.1 接入点分工

v0 按以下方式与 OpenClaw 集成：

- `AGENTS.md`
  放长期规则与行为原则
- `HEARTBEAT.md`
  放周期检查与继续推进提醒
- plugin tools
  暴露 adapter 能力给 Agent
- hooks / 固定流程
  保证失败后写回、下一轮前检查

### 7.2 不应放在 OpenClaw 本地层的内容

以下内容不应直接塞进本地长期文件：

- 全量 attempt 历史
- 全量 reflection 原文
- 全量 policy 历史版本

本地侧应只保留投影：

- 当前主目标
- 当前阶段
- 当前禁止重复的方法
- 当前优先下一步

### 7.3 本地与服务端的最小交互顺序

v0 推荐顺序：

1. 开始一轮前：`goal_get_current`
2. 若有 policy：`policy_get_current`
3. 若准备继续：`retry_guard_check`
4. 一轮结束后：`attempt_append`
5. 若失败：生成并提交 reflection
6. 新 session：`recovery_packet_get`

---

## 8. 存储架构

### 8.1 v0 推荐存储

v0 推荐使用：

- SQLite

原因：

- 单机可落地
- 状态量小
- 对本地/早期原型足够
- 测试与重建成本低

### 8.2 真相源

v0 的事实源应是：

- `goals`
- `attempts`
- `reflections`
- `policies`

`recovery packet` 不应作为主事实表存在，它更像派生视图。

### 8.3 热/冷路径

v0 不强制实现复杂冷热分层，但架构上应预留：

- 热路径：当前 goal、当前 policy、最近 attempt/recent failure
- 冷路径：更老的 attempts 与 reflections

---

## 9. 部署形态

### 9.1 v0 最小部署

```text
same machine
  - OpenClaw Agent
  - Goal Engine service
  - SQLite file
```

这是第一版最稳的形态。

优点：

- 不需要额外基础设施
- 更容易调试
- 对 Goal Engine 的“控制层”价值验证已足够

### 9.2 v0 不要求远程部署

第一版不要求：

- 云数据库
- Redis
- 消息队列
- 多实例扩缩容

因为这些不是当前验证重点。

---

## 10. 可测试性设计

### 10.1 模块必须可单测

以下模块必须独立可测：

- repositories
- policy engine
- retry guard
- recovery packet builder

### 10.2 关键集成流必须可测

至少要有三类集成测试：

1. `attempt -> reflection -> policy`
2. `policy -> retry_guard`
3. `goal + policy + history -> recovery_packet`

### 10.3 最终端到端验证

需要一个最小演示流：

- 创建 goal
- 记录失败 attempt
- 写入 reflection
- 生成 policy
- 下一轮被 retry guard 阻止旧策略
- 新 session 通过 recovery packet 恢复

---

## 11. v0 的非目标架构

v0 当前明确不做：

- event bus
- 分布式任务调度
- actor system
- 多 Agent 策略共享
- 在线训练管线
- 通用工作流编排引擎

这些都不是当前闭环成立的必要条件。

---

## 12. 当前结论

Goal Engine v0 的架构不应该被设计成“更大的 agent 平台”，而应该被设计成一个很克制的控制层：

- Agent 继续执行
- service 负责长期状态
- policy engine 负责把失败变成规则
- retry guard 负责把规则变成执行门
- recovery packet 负责跨 session 连续性

这五点成立，v0 才算真正可实施。
