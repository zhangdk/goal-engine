# Goal Engine OpenClaw User Experience Design

**Date:** 2026-04-04

**Goal:** 让会安装 OpenClaw、但不想自己调用 API 或手写集成的用户，可以通过 OpenClaw 显式入口体验 Goal Engine 的长期目标闭环。

## Product Position

这一版不是独立 Web 产品，也不是面向普通大众的新用户体验。

这一版是：

- 面向 OpenClaw 高级用户的能力层
- 通过 OpenClaw 显式入口调用
- 由 Goal Engine service 负责长期状态和规则
- 由本地 adapter / projection 提供最小恢复上下文

这一版不是：

- UI dashboard
- 自动接管全部 OpenClaw 行为
- 多目标、多 agent 的完整管理面板

## Target User

目标用户是：

- 已经装好 OpenClaw
- 愿意用显式命令或显式工具入口
- 不想自己写 API 请求
- 不想自己拼 projection 和恢复逻辑

## MVP Boundary

MVP 必须完成：

1. 用户可以在 OpenClaw 中开始一个长期目标
2. 用户可以查看当前目标状态
3. 用户可以记录一次失败，并得到更新后的指导
4. 用户在新 session 中可以恢复当前目标
5. projection 会自动刷新，不要求用户手动维护本地摘要文件

MVP 不包含：

- 完全自动失败识别
- 完全无感知 hook 接管
- 面向非 OpenClaw 用户的主入口

## User-Facing Entry Surface

第一版采用显式入口，名称面向用户，不直接暴露底层 HTTP 术语。

### 1. `start goal`

用途：

- 开始一个新的长期目标

最少输入：

- `title`
- `successCriteria`
- `currentStage`

成功输出：

- 目标已创建
- 当前阶段
- 成功标准摘要
- 已刷新本地恢复摘要

空状态输出：

- 不适用

可恢复错误：

- 已存在 active goal
- 输入不完整
- service 不可达

### 2. `show goal status`

用途：

- 查看当前目标、当前指导、最近失败和下一步建议

最少输入：

- 无

成功输出：

- 当前目标标题
- 当前阶段
- 成功标准摘要
- 最近失败摘要
- 当前禁止重复策略
- 推荐下一步

空状态输出：

- 当前没有 active goal

可恢复错误：

- projection 丢失但 service 可恢复
- service 不可达

### 3. `record failed attempt`

用途：

- 记录一次失败，并把失败变成下一轮的约束和建议

最少输入：

- `stage`
- `actionTaken`
- `strategyTags`
- `failureType`
- `summary`
- `rootCause`
- `mustChange`

成功输出：

- 已记录失败
- 当前更新后的指导
- 当前禁止重复策略
- 已刷新恢复摘要

空状态输出：

- 当前没有 active goal，无法记录失败

可恢复错误：

- 找不到 active goal
- reflection 字段缺失
- service 校验失败

### 4. `recover current goal`

用途：

- 新 session 中快速恢复到“下一步可执行”的状态

最少输入：

- 无

成功输出：

- 当前目标
- 当前阶段
- 最近失败摘要
- 当前禁止重复策略
- 推荐下一步

空状态输出：

- 当前没有 active goal，可提示创建新目标

可恢复错误：

- projection 缺失但 service 可恢复
- service 不可达

### 5. `check retry`

用途：

- 在重试前检查这次是不是还在重复旧路径

最少输入：

- `plannedAction`
- `whatChanged`
- `strategyTags`
- `policyAcknowledged`

成功输出：

- 是否允许继续
- 如果不允许，给出原因和建议
- 如果允许，确认本轮已经满足最小变化要求

空状态输出：

- 当前没有 active goal
- 当前还没有 guidance，可提示先记录失败或继续探索

可恢复错误：

- 当前没有 policy
- 输入不完整
- service 不可达

## User-Facing Language

底层术语与用户展示语言统一为：

- `policy` -> `current guidance` / `当前策略建议`
- `retry_guard` -> `retry check` / `重复尝试检查`
- `recovery_packet` -> `recovery summary` / `恢复摘要`

保留原始机器码用于调试，但默认不直接展示给普通用户。

## Canonical User Flows

### Flow 1: Start First Goal

1. 用户调用 `start goal`
2. Goal Engine 创建 active goal
3. projection 自动刷新
4. OpenClaw 返回目标已开始和当前摘要

### Flow 2: Inspect Current Status

1. 用户调用 `show goal status`
2. 系统从 service 获取当前 goal + guidance
3. 必要时重建 projection
4. OpenClaw 返回当前状态摘要

### Flow 3: Record Failure And Update Guidance

1. 用户调用 `record failed attempt`
2. 系统写入 attempt
3. 系统生成并提交 reflection
4. service 更新 policy
5. projection 自动刷新
6. OpenClaw 返回更新后的 guidance

### Flow 4: Restart Session And Recover

1. 用户在新 session 中调用 `recover current goal`
2. 系统读取 recovery summary 和 current guidance
3. 若 projection 缺失，则从 service 重建
4. OpenClaw 返回“下一步可执行”的恢复摘要

## Automatic Behaviors In MVP

MVP 中自动执行的只有：

- goal 创建后刷新 projection
- failure 写回后刷新 projection
- 恢复时缺 projection 则自动重建

MVP 中暂不自动执行：

- 每次失败后自动识别并写回
- 每次重试前自动强制拦截所有动作
- 无感知注入所有上下文

## Acceptance Bar

只有当下面这句话成立，才能说这一版进入“可体验”状态：

“一个会安装 OpenClaw、但不想自己接插件和写 API 的用户，可以在 15 到 30 分钟内完成接入，并成功跑通一次长期目标创建、失败写回、状态恢复的闭环。”
