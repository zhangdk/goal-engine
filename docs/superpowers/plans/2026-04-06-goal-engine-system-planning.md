# Goal Engine System Planning Execution Roadmap

**Goal:** 按系统能力而不是按零散缺口推进 Goal Engine，使其成为“管理并观测真实托管 OpenClaw Agent 的长期目标控制层”。

## Milestones

### M1. Real Managed Agent Foundation

目标：

- UI 主实体固定为真实 OpenClaw Agent
- 支持多个托管 Agent 列表
- 当前 active goal 只挂当前托管 Agent

当前状态：

- 已基本完成

交付物：

- `service/src/ui/managed-openclaw-agents.ts`
- `service/src/ui/agent-gallery.ts`
- `service/src/ui/agent-detail.ts`
- `service/src/routes/ui.ts`

验证：

- `service/test/routes.ui-agents.test.ts`
- `service/e2e/agent-evolution-ui.spec.ts`

### M2. Real Runtime Wiring

目标：

- 真实运行时上下文驱动 `runtime-state.json`
- 不再预置 runtime-state 模板文件
- 当前托管 Agent 切换可以反映到 `/ui`

当前状态：

- 部分完成

已完成：

- `agent-adapter` CLI 支持显式 runtime context
- `agent-adapter` CLI 支持从 `OPENCLAW_*` 环境变量读取 runtime context
- 只有显式 `agent/session/workspace` 时才会写 `runtime-state.json`
- `runtime-state.json` 会继承 `workspace-state` 的 managed agent registry，而不是退化成单 agent
- `service` 已支持 `runtime-state > workspace-state`
- 已有跨包 E2E 验证：CLI 注入 runtime context 后，`/ui` 会切到对应 managed agent

未完成：

- 自动执行 `goal_engine_bootstrap` 的 lifecycle wiring 尚未完成
- retry / failure 生命周期自动接线在当前 hook 语义下仍不安全

交付物：

- `agent-adapter/src/openclaw/cli.ts`
- `agent-adapter/src/openclaw/runtime-state.ts`
- `agent-adapter/src/openclaw/paths.ts`

验证：

- `agent-adapter/test/openclaw-cli.test.ts`
- `service/test/routes.ui-agents.test.ts`

### M3. Learning Evidence Completion

目标：

- retry check 历史持久化
- recovery 事件持久化
- timeline 与 verdict 绑定完整证据链

当前状态：

- 已完成

主要任务：

- [x] 设计 retry history 数据模型
- [x] 新增 retry history 持久化
- [x] 在 detail timeline 中展示 retry 事件
- [x] 设计 recovery event 数据模型
- [x] 新增 recovery event 持久化
- [x] 在 detail timeline 中展示 recovery 事件
- [x] 更新 verdict 规则与 gap 文案
- [x] 区分 recovery 来源（projection vs service）

建议文件：

- `service/src/repos/retry-history.repo.ts`
- `service/src/repos/recovery-event.repo.ts`
- `service/src/routes/retry-guard.ts`
- `service/src/routes/recovery.ts`
- `service/src/ui/timeline.ts`
- `service/src/ui/verdict.ts`

验证：

- 单测覆盖 repos 和 route contracts
- E2E 覆盖 retry/recovery 历史可见性

### M4. OpenClaw Runtime Integration

目标：

- OpenClaw 真实调用链传入 runtime context
- CLI 与 runtime wiring 对齐
- session/agent 切换真实驱动 UI

当前状态：

- 部分完成

主要任务：

- [x] 识别 OpenClaw 本地插件入口与安装方式
- [x] 为 `bootstrap` 传入 runtime context
- [x] 为 `entrypoint` 传入 runtime context
- [x] 切换 session 时刷新 runtime-state
- [x] 增加真实调用路径集成测试
- [x] 提供本地 OpenClaw 插件壳、插件清单和安装脚本
- [x] 完成本机 `openclaw plugins install/list/inspect` smoke 验证
- [ ] 将 `goal_engine_bootstrap` 固化为自动 lifecycle 行为
- [x] 评估 retry / failure hook 自动化可行性

建议文件：

- `openclaw/commands.json`
- `openclaw/README.md`
- `agent-adapter/src/openclaw/cli.ts`
- `agent-adapter/src/openclaw/bootstrap-session.ts`
- `agent-adapter/src/openclaw/dispatch-entrypoint.ts`

验证：

- 真实 OpenClaw 浏览器路径 QA
- `service /ui` 随当前托管 Agent 切换而变化

### M5. Product Integration and QA

目标：

- 提升可用性
- 补齐用户验收材料
- 提供更稳定的产品体验

当前状态：

- 部分完成

主要任务：

- [ ] 收紧空状态、错误态、无历史状态
- [ ] 增加更多浏览器 E2E
- [x] 更新 Quickstart / User Guide / Acceptance Checklist
- [ ] 如果适合，接 OpenClaw 原生 UI 容器
- [ ] 完成 agent-goal 历史归属模型，并在 UI 中暴露该 agent 的 goal history

## Remaining Gaps

### G1. Agent-Goal History Model

当前状态：

- 已完成

主要任务：

- [x] 持久化 goal 与 managed agent 的归属历史
- [x] 在 UI detail 中暴露 agent 的 goal history
- [x] 回答”一个 goal 曾归属过哪些 agent”（`GET /api/v1/goals/:goalId/agents`）
- [x] 建立 session rollover 的更明确连续性表示（`session_rollover` assignmentReason）

### G2. Recovery Source Modeling

当前状态：

- 已完成

主要任务：

- [x] 为 recovery event 增加来源建模（projection vs service）
- [x] 在 timeline / detail 中显示恢复来源
- [x] 增加对应单测（`recovery-source.test.ts`）

### G3. Host-Side OpenClaw Wiring

当前状态：

- 部分完成

主要任务：

- [x] 接入本地 OpenClaw 插件发现/加载入口
- [x] 验证插件安装、加载和工具注册
- [x] 固化本地接线脚本和 bootstrap 文件注入
- [ ] 自动执行 `goal_engine_bootstrap`
- [x] 评估 retry / failure 生命周期自动接线

当前结论：

- OpenClaw 并非没有 hook 能力
- 但现有内置 hook 和 plugin hook 都没有足够语义来安全自动化 Goal Engine 的 retry / failure 判断
- 因此这部分仍保留为显式工具调用

## Delivery Order

严格按这个顺序推进：

1. M2 Real Runtime Wiring 完成真实参数注入
2. M3 持久化学习证据
3. M4 打通真实 OpenClaw runtime integration
4. M5 做产品化体验和 QA

## Execution Rules

后续每轮开发都要遵守：

1. 先写失败测试，再写实现
2. 不允许回退到 goal 伪 agent 模型
3. 不允许再次引入预置 runtime-state 模板数据
4. 所有主视图字段必须能指出真实来源
5. 每完成一个 milestone，就跑一次类型检查、单测、E2E

## Verification Commands

### Agent Adapter

```bash
cd agent-adapter
pnpm exec tsc --noEmit
pnpm test
```

### Service

```bash
cd service
pnpm exec tsc --noEmit
pnpm test
pnpm test:e2e
```

## Success Line

当下面这句话成立时，这个规划才算进入正确轨道：

**OpenClaw 在真实会话中切换托管 Agent 时，Goal Engine 可以基于真实 runtime context 更新当前托管 Agent，并在 `/ui` 中展示该 Agent 的当前目标、学习证据和恢复状态。**
