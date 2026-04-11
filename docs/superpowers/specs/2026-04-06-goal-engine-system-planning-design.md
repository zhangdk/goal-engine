# Goal Engine System Planning Design

**Status:** Active planning baseline  
**Date:** 2026-04-06  
**Audience:** Product, engineering, integration owners

## 1. Product Goal

Goal Engine 的核心目标不是展示 goal 数据，也不是单独做一个面板，而是：

**管理并观测真实托管的 OpenClaw Agent，让它们围绕长期目标持续推进，并在失败、重试和 session 切换后保持方向连续性。**

因此，系统主实体必须是：

- 真实 OpenClaw Agent

而不是：

- active goal
- goal/session context
- UI 临时拼出来的伪 agent

## 2. Planning Principles

后续规划和实施必须遵守这 6 条原则：

1. UI 主实体永远是 `OpenClaw Agent`
2. `goal` 是挂在 agent 下的托管状态，不反过来
3. 运行时事实优先于静态 seed 文件
4. 没有真实来源的字段不进入产品主视图
5. 托管层、目标层、学习层、恢复层必须分离
6. 不再按单点问题零散补功能，必须按阶段推进

## 3. System Layers

### 3.1 Agent Management Layer

解决“系统到底在管谁”。

必须回答：

- 当前有哪些真实 OpenClaw Agent 被 Goal Engine 托管
- 当前哪个 Agent 是 active managed agent
- 每个 Agent 属于哪个 workspace / session
- 托管切换时谁负责更新运行时状态

核心对象：

- `agent_id`
- `agent_name`
- `workspace`
- `session`
- `managed`

### 3.2 Goal Control Layer

解决“这个 Agent 当前在推进什么”。

必须回答：

- 当前 active goal 是什么
- goal 当前处于哪个阶段
- 成功标准是什么
- 当前 guidance 是什么
- goal 是否结束、暂停或切换

核心对象：

- `goal`
- `attempt`
- `reflection`
- `policy`

### 3.3 Learning Evidence Layer

解决“这个 Agent 有没有因为失败而改变”。

必须回答：

- 最近失败是什么
- 反思是否产生
- strategy / policy 是否更新
- 后续行为是否变化
- retry 是否成功阻断重复路径

核心输出：

- `timeline`
- `verdict`
- `system gaps`

### 3.4 Session Recovery Layer

解决“换 session 后还能不能接着干”。

必须回答：

- 当前 Agent 能否恢复其 goal 上下文
- projection 是否可用
- recovery packet 是否能重建最小继续状态
- 恢复是来自本地 projection 还是 service 重算

核心对象：

- `projection`
- `recovery packet`
- `bootstrap state`
- `runtime state`

## 4. Capability Tree

### A. Manage Real OpenClaw Agents

- 识别真实 OpenClaw Agent 身份
- 读取当前托管 Agent
- 列出全部托管 Agent
- 标记 active managed agent
- 响应 agent/session 切换

### B. Control Goals Per Agent

- 给指定 Agent 创建 goal
- 查看该 Agent 当前 active goal
- 更新 goal 阶段和状态
- 保持单 agent 单 active goal 约束
- 在详情页中展示当前 guidance

### C. Record Learning and Policy Change

- 记录 attempt
- 记录 reflection
- 生成 / 更新 policy
- 检查 retry
- 提供行为变化证据

### D. Recover Across Sessions

- bootstrap 当前 Agent
- 读取 projection
- 重建 recovery summary
- 表示恢复来源
- 处理无 active goal 空状态

### E. Product UI

- Agent Gallery
- Agent Detail
- Current State
- Evolution Timeline
- Verdict
- System Gaps

## 5. Source-of-Truth Rules

为了避免再次出现“看起来像真实，其实是伪状态”的问题，事实源优先级必须固定：

1. **OpenClaw runtime context**
2. **runtime-state.json**
3. **workspace-state.json**
4. **service facts**

解释：

- `runtime context` 决定当前真实 Agent 身份
- `runtime-state.json` 只应该是运行时落盘缓存，不应预置模板数据
- `workspace-state.json` 只作为 bootstrap/default seed
- `service facts` 负责 goal、attempt、reflection、policy、recovery 等长期控制数据

## 6. Current Gaps

当前系统仍然存在这些结构性缺口：

### 6.1 Runtime Identity Injection Missing

虽然 CLI 和本地插件壳都已经支持显式传入真实 runtime context 并写入 `runtime-state.json`，但 OpenClaw 侧还没有自动执行 `goal_engine_bootstrap`，也没有 retry / failure 生命周期自动接线。

### 6.2 Automatic Lifecycle Wiring Missing

当前已经完成：

- 本地插件发现与加载
- Goal Engine 工具注册
- `BOOT.md` 和 `bootstrap-extra-files` 的 bootstrap context 注入

当前仍缺：

- 自动执行 `goal_engine_bootstrap`
- retry / failure 的稳定语义 hook
- 基于更强 hook 语义的自动重试阻断或失败写回

技术判断：

- OpenClaw 内置 internal hooks 目前只覆盖 `gateway:startup`、`agent:bootstrap`、`command`、`command:new/reset`
- OpenClaw plugin SDK 虽然额外支持 `before_tool_call`、`after_tool_call`、`before_dispatch`、`agent_end` 等 plugin hooks
- 但这些 hook 仍缺少 Goal Engine 做 retry / failure 自动化所需的稳定业务语义
- 因此当前缺口不是“完全没有 hook”，而是“没有足够语义化的 hook”

## 7. Phase Roadmap

### Phase 1: Real Managed Agent Foundation

目标：

- UI 主实体纠正为真实 OpenClaw Agent
- 支持托管 Agent 列表
- 当前 active goal 只挂当前托管 Agent

验收：

- `/ui` 首页主对象是 Agent，不是 goal
- 至少可以展示多个托管 Agent
- 当前 active goal 不会错误挂给所有 Agent

### Phase 2: Real Runtime Wiring

目标：

- OpenClaw 实际调用链传入真实 runtime context
- CLI 写出真实 `runtime-state.json`
- service UI 实时反映当前托管 Agent 切换

验收：

- session / agent 切换后 `/ui` 能反映真实 active managed agent
- 不再依赖预置 `runtime-state.json`
- OpenClaw 已能发现并加载 Goal Engine 本地插件壳

### Phase 3: Learning Evidence Completion

目标：

- retry check 历史持久化
- recovery 事件持久化
- verdict 与 timeline 建立在完整证据链上

验收：

- detail 页能显示 retry 历史事件
- detail 页能显示 recovery 历史事件
- `system gaps` 中相关 missing 项减少

### Phase 4: Product Integration

目标：

- 进入 OpenClaw 原生体验
- 提升浏览器可用性和稳定性
- 文档、QA、验收齐套

验收：

- OpenClaw 内可以直接进入 Agent 观测体验
- 外部用户能在固定流程下复现托管、学习、恢复闭环
- 自动 lifecycle wiring 策略与文档状态一致

## 8. What Engineering Must Not Do

后续研发必须避免：

- 再把 `goal` 当成主实体
- 再从 `workspace-state` 伪造 runtime 事实
- 在没有真实来源时把字段展示为产品事实
- 在没有阶段规划的情况下点状补功能

## 9. Immediate Next Step

接下来最正确的工程方向是：

**把 OpenClaw 实际运行路径接上显式 runtime context 注入。**

也就是在真实调用时把这些参数传给 CLI：

- `agent_id`
- `agent_name`
- `workspace`
- `session`

只有做到这一步，`runtime-state.json` 才是“真实运行时缓存”，而不是“本地文件层近似物”。
