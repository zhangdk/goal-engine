# Goal Engine Observability UI Design

**Date:** 2026-04-06

**Goal:** 为 Goal Engine 增加一层本地 UI，用来忠实映射原始产品需求与当前 MVP 设计，并明确展示当前实现差距，而不是重新定义“AI 是否进化”的标准。

## Why This UI Exists

这层 UI 的第一职责不是做一个新的使用入口，而是做一个**需求映射面板**。

它要回答的问题是：

- 原始 PRD 要求 Goal Engine 达成什么
- 当前 OpenClaw MVP 版本收口到了什么
- 当前仓库实际已经实现了什么
- 哪些能力只是部分实现，哪些还没有

如果原始需求和当前实现之间有断层，UI 应该把断层暴露出来，而不是用新的解释去掩盖它。

## Source Of Truth

第一版 UI 的判断依据同时来自两层文档：

1. `docs/goal-engine-prd.md`
2. `docs/superpowers/specs/2026-04-04-goal-engine-openclaw-user-experience-design.md`

解释方式：

- `goal-engine-prd.md` 定义“原始产品意图”
- `2026-04-04-goal-engine-openclaw-user-experience-design.md` 定义“当前这版 OpenClaw MVP 承诺”
- UI 用真实接口和真实验证结果填入“当前实现状态”

## Product Position

第一版 UI 是：

- 本地可打开的观测页面
- 挂在 Goal Engine service 上的独立页面
- 面向产品评估和实现差距审计
- 可以在后续被嵌入 OpenClaw

第一版 UI 不是：

- 替代 OpenClaw 的主交互面
- 新的长期状态事实源
- 重新定义产品目标的策略面板
- 面向大众用户的完整前台产品

## Core Screens

第一版只做一个主页面 `/ui`，但主页面分成三个明确区域。

### 1. Original Intent

展示来自 PRD 的原始目标：

- Goal Engine 要解决什么问题
- 原始关键能力点
- 原始不做什么

这一栏是静态映射，不来自数据库。

### 2. Current MVP Intent

展示来自当前 OpenClaw UX 设计稿的目标：

- 当前 MVP 的 5 个入口
- 当前 MVP 包含什么
- 当前 MVP 明确不包含什么
- 当前验收线

这一栏也是文档映射，不直接来自运行时数据。

### 3. Implementation Status

展示来自真实接口和真实验证的当前状态：

- 当前 active goal
- 当前 guidance
- 最近失败
- 最近 retry check 结果
- 最近 recovery summary
- projection 状态
- 已实现 / 部分实现 / 未实现

## Page Sections

首页建议布局：

```text
+--------------------------------------------------------------+
| Goal Engine Observability UI                                 |
+--------------------------------------------------------------+
| Original Intent | Current MVP Intent | Implementation Status |
+--------------------------------------------------------------+
| Current Goal / Guidance / Last Failure / Retry / Recovery    |
+--------------------------------------------------------------+
| Gap Audit                                                    |
| - Covered                                                    |
| - Partial                                                    |
| - Missing                                                    |
+--------------------------------------------------------------+
| Actions                                                      |
| [Start Goal] [Show Status] [Record Failure] [Check Retry]    |
| [Recover]                                                    |
+--------------------------------------------------------------+
```

## Gap Audit Model

第一版只允许三种状态，避免 UI 自己发明复杂评分：

- `covered`
- `partial`
- `missing`

每一个审计项都需要：

- `source`
  - `prd`
  - `mvp`
- `requirement`
- `status`
- `evidence`
- `notes`

例如：

- requirement: “失败后应转化为下一轮策略输入”
- status: `covered`
- evidence: “record failed attempt 后 guidance 更新并写入 avoid strategy”

## What The UI Must Expose

第一版必须能展示这些实际证据：

- active goal 是否存在
- guidance 是否存在
- 最近失败是否存在
- retry check 是否有 blocked 证据
- recovery 是否能给出下一步可执行状态
- projection 是否 ready

第一版还必须展示这些差距：

- 没有 Goal Engine 专属 OpenClaw UI 页面
- 真实 runtime/plugin/hook wiring 未完成
- 当前体验仍然依赖显式入口，不是自然接管
- “普通用户体验”未实现

## Data Strategy

继续保持 `service` 为唯一事实源。

UI 的数据来源分两类：

1. 文档映射数据
   - 原始意图
   - 当前 MVP 意图
2. 运行时聚合数据
   - 当前状态
   - 审计项状态
   - 最近验证证据

UI 不直接把 markdown projection 当成事实源。projection 只作为“本地恢复机制是否就绪”的一个观测信号。

## Interface Strategy

第一版建议：

- UI 页面挂在 `service` 上，例如 `/ui`
- 新增一个聚合接口，例如 `/api/v1/ui/observability`

聚合接口职责：

- 读取当前 goal / policy / recovery 状态
- 生成 gap audit 的当前视图
- 返回 UI 首页所需的一个聚合 payload

聚合接口不引入新业务判断，不修改 service 事实模型，只做观测数据拼装。

## Acceptance Criteria

第一版 UI 只有在下面这些条件成立时才算有效：

1. 打开 `/ui` 后能同时看见：
   - 原始 PRD 意图
   - 当前 MVP 意图
   - 当前实现状态
2. 用户能一眼分辨：
   - 已覆盖项
   - 部分覆盖项
   - 未覆盖项
3. 用户能看到最近一次失败、重试检查和恢复的真实证据
4. UI 明确指出当前实现差距，而不是只展示“看起来成功”的信息
5. UI 不引入新的状态源，不与现有 service / adapter 语义冲突

## Not In Scope

第一版明确不做：

- 单独的前端工程
- 复杂多页导航
- 历史趋势分析系统
- 自动评估“AI 是否真的进化”的新评分模型
- 多目标审计
- 多 agent 审计
- 面向普通大众的 polished 产品页面

## Next Review Input

下一步 `plan-eng-review` 应该重点审这几个问题：

1. UI 是否应该只挂在 `service` 上，还是需要单独前端层
2. 聚合接口是否足够轻量，是否过度引入新抽象
3. Gap audit 的状态判定是否应该写死在 UI 层还是后端聚合层
4. 文档映射内容应不应该静态内置，还是通过配置/文档提取提供
5. 测试如何覆盖“需求映射正确”而不仅是“页面渲染成功”
