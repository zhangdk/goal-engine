# Goal Engine

[English](README.md) | [中文](README_zh.md)

Goal Engine 是一个为自主智能体（OpenClaw Agent）设计的持久化目标管理与行为进化系统。它通过强制执行 **尝试-反思-进化 (Attempt-Reflect-Evolve)** 闭环，将大语言模型（LLM）从简单的“反应式预测器”转变为具备长期目标驱动能力的“进化者”。

## 核心理念

- **目标持久化**：目标在会话重启、失败或环境重置后依然存续。
- **持续进化**：智能体从失败中学习，通过结构化反思更新内部策略（Policy）。
- **自主执行堆栈**：提供任务编译、策略选择、边界管理及无成功证据不宣告完成的硬性约束。

## OpenClaw 详细集成指南

### 1. 前提条件
- **Node.js**: >= 22.0.0
- **pnpm**: >= 9.0.0
- **OpenClaw**: 已安装并可运行的本地 OpenClaw 环境。

### 2. 安装步骤
首先，克隆仓库并安装依赖：
```bash
git clone https://github.com/zhangdk/goal-engine.git
cd goal-engine
pnpm install
```

启动 Goal Engine 服务：
```bash
cd service
pnpm dev
```

安装本地 OpenClaw 插件：
```bash
cd ..
./scripts/install-local.sh
```
该脚本会自动注册插件，启用必要的 Hook（`boot-md`, `bootstrap-extra-files`），并将 `serviceUrl` 配置为 `http://localhost:3100`。

### 3. 在 OpenClaw 中使用

Goal Engine 向 OpenClaw Agent 暴露了 5 个核心入口（Entrypoints）。为了获得最佳进化效果，请遵循 **“工具优先 (Tool-First)”** 工作流。

#### **A. 开始一个新目标**
当你给 Agent 一个任务（如“赚 100 元”）时，它应该将其编译为结构化目标：
```bash
# 通过适配器 CLI 调用示例
pnpm --dir agent-adapter openclaw entrypoint "start goal" --payload '{"title":"24小时赚100元","successCriteria":["存在支付确认证据"],"currentStage":"initial"}'
```

#### **B. 检查状态与对齐**
在执行任何外部动作（搜索、浏览等）前，Agent 必须对齐当前任务：
```bash
pnpm --dir agent-adapter openclaw entrypoint "show goal status" --payload '{"expectedGoalTitle":"24小时赚100元"}'
```

#### **C. 记录失败尝试**
如果某个策略失败（如被验证码拦截），Agent **必须** 记录它以更新策略：
```bash
pnpm --dir agent-adapter openclaw entrypoint "record failed attempt" --payload '{"stage":"initial","actionTaken":"尝试了百度搜索","strategyTags":["search"],"failureType":"stuck_loop"}'
```

#### **D. 重试检查 (重试守卫)**
在尝试类似路径前，Agent 会检查新计划是否与上次有显著不同：
```bash
pnpm --dir agent-adapter openclaw entrypoint "check retry" --payload '{"plannedAction":"尝试必应搜索","whatChanged":"从百度切换到必应","strategyTags":["search"],"policyAcknowledged":true}'
```

#### **E. 恢复目标会话**
在新会话中，使用此入口从服务端恢复上下文：
```bash
pnpm --dir agent-adapter openclaw entrypoint "recover current goal"
```

### 4. 典型工作流：“营收冲刺”示例
1. **用户**：“给你个任务：一天内赚 100 元，方法不限。”
2. **Agent**：调用 `goal_engine_start_goal` 创建合约。
3. **Agent**：选择策略（如：销售自动化脚本微服务）。
4. **Agent**：某次尝试失败 -> 调用 `record_failed_attempt`。
5. **Goal Engine**：更新策略（如：“避开路径 X，尝试路径 Y”）。
6. **Agent**：调用 `check_retry` -> 允许 -> 执行新路径。
7. **Agent**：获取成功证据 -> 更新状态或记录成功。

## 关键组件
- **`service/`**：基于 Node.js/Hono 和 SQLite 的后端服务。
- **`agent-adapter/`**：处理重试守卫和会话恢复的编排层。
- **`openclaw/`**：OpenClaw 插件集成外壳。

## 访问 UI
访问 `http://localhost:3100/ui` 观察 Agent 的进化轨迹、证据链和学习时间轴。

## 开源协议
本项目采用 [MIT](LICENSE) 协议开源。
