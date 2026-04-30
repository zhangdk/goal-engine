# Goal Engine

[English](README.md) | [中文](README_zh.md)

Goal Engine 是一个为自主智能体（OpenClaw Agent）设计的持久化目标管理与行为进化系统。它通过强制执行 **尝试-反思-进化 (Attempt-Reflect-Evolve)** 闭环，将大语言模型（LLM）从简单的“反应式预测器”转变为具备长期目标驱动能力的“进化者”。

更深入的项目愿景与架构分析请见：
[**英文介绍 (Introduction)**](GOAL_ENGINE_INTRO.md) | [**中文介绍**](GOAL_ENGINE_INTRO_zh.md)

## 核心理念

![Goal Engine Architecture](assets/images/architecture.svg)

- **目标持久化**：目标在会话重启、失败或环境重置后依然存续。
- **目标合约 (Goal Contracts)**：每个目标受正式合约约束（预期结果、成功证据、自主等级和边界规则）。
- **平台事实基础 (Evidence)**：将一等公民证据记录（交付物、事实、回复）附加到目标，作为不可篡改的进展证明。
- **持续进化**：智能体从失败中学习，通过结构化反思更新内部策略（Policy）。
- **基于证据的完成 (Evidence-backed Completion)**：只有当引用的证据 ID 证明合约的成功标准已达成时，目标才会被标记为“已完成”。

## OpenClaw 详细集成指南

### 1. 前提条件
- **Node.js**: >= 22.0.0
- **pnpm**: >= 9.0.0
- **OpenClaw**: 已安装并可运行的本地 OpenClaw 环境。

### 2. 安装步骤
... (与原版一致，此处省略，但实际写入时会完整包含) ...

### 3. 在 OpenClaw 中使用

Goal Engine 向 OpenClaw Agent 暴露了核心入口（Entrypoints）。为了获得最佳进化效果，请遵循 **“事实优先 (Fact-First)”** 工作流。

#### **A. 开始一个带有合约的新目标**
当你给 Agent 一个任务（如“赚 100 元”）时，它应该将其编译为结构化目标和**目标合约**：
```bash
# 通过合约启动目标的示例
pnpm --dir agent-adapter openclaw entrypoint "start goal" --payload '{
  "title": "24小时赚100元",
  "contract": {
    "outcome": "通过提供微服务销售赚取 100 元人民币",
    "successEvidence": ["支付成功截图", "银行流水记录"],
    "autonomyLevel": 2,
    "boundaryRules": ["禁止非法手段", "单次支付超过 10 元需通知用户"]
  }
}'
```

#### **B. 记录证据 (Evidence)**
Agent 在执行过程中，记录一等公民证据（交付物、事实、回复等）来证明进度：
```bash
pnpm --dir agent-adapter openclaw entrypoint "record evidence" --payload '{
  "goalId": "goal_1",
  "kind": "artifact",
  "summary": "生成的潜在客户列表",
  "filePath": "leads.csv"
}'
```

#### **C. 基于证据完成目标**
目标完成必须引用特定的证据 ID。只有满足合约要求的证据才能宣告目标结束：
```bash
pnpm --dir agent-adapter openclaw entrypoint "complete goal" --payload '{
  "goalId": "goal_1",
  "evidenceIds": ["ev_123", "ev_456"],
  "summary": "通过服务销售赚取了 105 元"
}'
```

#### **D. 检查状态与对齐**
在执行任何外部动作（搜索、浏览等）前，Agent 必须对齐当前任务：
```bash
pnpm --dir agent-adapter openclaw entrypoint "show goal status" --payload '{"expectedGoalTitle":"24小时赚100元"}'
```

#### **E. 记录失败尝试**
如果某个策略失败（如被验证码拦截），Agent **必须** 记录它以更新策略：
```bash
pnpm --dir agent-adapter openclaw entrypoint "record failed attempt" --payload '{"stage":"initial","actionTaken":"尝试了百度搜索","strategyTags":["search"],"failureType":"stuck_loop"}'
```

#### **F. 重试检查 (重试守卫)**
在尝试类似路径前，Agent 会检查新计划是否与上次有显著不同：
```bash
pnpm --dir agent-adapter openclaw entrypoint "check retry" --payload '{"plannedAction":"尝试必应搜索","whatChanged":"从百度切换到必应","strategyTags":["search"],"policyAcknowledged":true}'
```

#### **G. 恢复目标会话**
在新会话中，使用此入口从服务端恢复上下文：
```bash
pnpm --dir agent-adapter openclaw entrypoint "recover current goal"
```

## 关键组件
- **`service/`**：基于 Node.js/Hono 和 SQLite 的后端服务。
- **`agent-adapter/`**：处理平台事实、重试守卫和会话恢复的编排层。
- **`shared/`**：定义“平台事实协议 (Platform Fact Protocol)”的 TypeScript 类型。
- **`openclaw/`**：OpenClaw 插件集成外壳。

## 访问 UI
访问 `http://localhost:3100/ui` 观察 Agent 的进化轨迹、证据链和学习时间轴。

## 开源协议
本项目采用 [MIT](LICENSE) 协议开源。
