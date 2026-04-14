# Goal Engine

[English](README.md) | [中文](README_zh.md)

Goal Engine 是一个为自主智能体（OpenClaw Agent）设计的持久化目标管理与行为进化系统。它将大语言模型（LLM）从简单的“反应式预测器”转变为具备长期目标驱动能力的“进化者”。

## 核心理念

- **目标持久化**：目标在会话重启、失败或环境重置后依然存续。
- **持续进化**：智能体从失败中学习，通过结构化反思更新内部策略（Policy）。
- **自主控制堆栈**：提供任务编译、策略选择、边界管理及无成功证据不宣告完成的硬性约束。
- **技能获取**：鼓励智能体在现有能力失效时主动“狩猎”或“锻造”新技能。

## 关键组件

- **`service/`**：基于 Node.js/Hono 和 SQLite 的后端，管理目标、尝试、反思和策略。
- **`agent-adapter/`**：环境适配层，处理重试守卫（Retry Guard）和任务恢复（Recovery）。
- **`shared/`**：定义通信协议的通用 TypeScript 类型。
- **`openclaw/`**：OpenClaw 插件集成外壳，提供显式工具入口。

## 快速开始

### 前提条件
- **Node.js**: >= 22.0.0
- **pnpm**: >= 9.0.0

### 安装并启动服务
```bash
pnpm install
cd service
pnpm dev
```

### 访问 UI
启动后访问 `http://localhost:3100/ui` 观察智能体的行为进化轨迹和证据链。

## 开源协议

本项目采用 [MIT](LICENSE) 协议开源。
