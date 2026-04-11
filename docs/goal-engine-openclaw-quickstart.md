# Goal Engine OpenClaw Quickstart

## 这份文档给谁看

这份 Quickstart 面向这类用户：

- 你已经装好 OpenClaw
- 你愿意在本地跑一个 service
- 你不想直接调用 Goal Engine API
- 你想验证 Goal Engine 是否真的能让长期目标在多次 session 中持续推进

这份文档不面向普通大众用户，也不提供一键安装器。

## 当前你能体验到什么

当前仓库已经具备：

- Goal Engine `service`
- `agent-adapter` 的 projection / workflow 底座
- OpenClaw 插件壳、显式入口约定和本地安装脚本
- 用户闭环 E2E 验证

当前仓库还没有真正完成：

- 全自动 OpenClaw lifecycle hook wiring
- 面向普通用户的安装流程

另外，当前已完成本机 smoke 验证：

- `openclaw plugins install -l /Users/gushuai/dev/Protocol30/goal-engine`
- `openclaw plugins list`
- `openclaw plugins inspect goal-engine`

所以这份 Quickstart 的目标是：

让你以“OpenClaw 高级用户”的方式，在 15 到 30 分钟内跑通一次长期目标闭环。

## 1. 启动 Goal Engine service

```bash
cd /Users/gushuai/dev/Protocol30/goal-engine/service
pnpm dev
```

健康检查：

```bash
curl http://localhost:3100/api/v1/health
```

期望：

- 返回 `{"data":{"status":"ok",...}}`

## 2. 理解当前的 OpenClaw 接线层

这版仓库约定了 5 个显式入口：

- `start goal`
- `show goal status`
- `record failed attempt`
- `recover current goal`
- `check retry`

入口定义在：

- `openclaw/README.md`
- `openclaw/goal-engine-entrypoints.md`
- `.openclaw/workspace-state.json`

真实接线入口位于：

- `agent-adapter/src/openclaw/dispatch-entrypoint.ts`
- `agent-adapter/src/openclaw/bootstrap-session.ts`
- `agent-adapter/src/openclaw/cli.ts`
- `openclaw/commands.json`
- `index.ts`
- `openclaw.plugin.json`
- `scripts/install-local.sh`

## 3. 理解 projection 工作区

Goal Engine 的 projection 文件位于：

```text
examples/workspace/goal-engine/
```

这里的文件只应该保存摘要：

- 当前目标
- 当前策略建议
- 恢复摘要

不应该保存：

- 全量 attempts
- 全量 reflections
- policy 历史

## 4. 安装本地 OpenClaw 插件

```bash
cd /Users/gushuai/dev/Protocol30/goal-engine
./scripts/install-local.sh
```

安装后可验证：

```bash
openclaw plugins list
openclaw plugins inspect goal-engine
```

这一步完成的是：

- 本地插件发现与加载
- Goal Engine 工具注册
- `BOOT.md` 和 bootstrap context 文件注入

这一步还没有完成的是：

- 自动执行 `goal_engine_bootstrap`
- retry / failure 生命周期自动化

原因不是 OpenClaw 完全没有 hook，而是当前 hook 事件不携带足够业务语义，无法安全推断：

- 这次重试是否真的与上次不同
- 这次失败是否应写成 Goal Engine failed attempt

## 5. 直接调用 OpenClaw 接线层

当前最直接的方式是调用 adapter 的显式接线层，而不是自己拼 HTTP：

```bash
cd /Users/gushuai/dev/Protocol30/goal-engine/agent-adapter
pnpm openclaw bootstrap
```

查看状态：

```bash
cd /Users/gushuai/dev/Protocol30/goal-engine/agent-adapter
pnpm openclaw entrypoint "show goal status"
```

开始目标：

```bash
cd /Users/gushuai/dev/Protocol30/goal-engine/agent-adapter
pnpm openclaw entrypoint "start goal" --payload '{"title":"Ship Goal Engine","successCriteria":["One explicit flow works"],"currentStage":"integration"}'
```

## 6. 跑一次用户闭环

如果你想验证整个用户流仍然成立，再跑仓库已有的 E2E：

```bash
cd /Users/gushuai/dev/Protocol30/goal-engine/service
pnpm test:e2e
```

期望：

- API E2E 通过
- `OpenClaw-oriented Goal Engine user experience` 通过

这条用户流验证的是：

1. 开始目标
2. 查看当前状态
3. 记录失败
4. 进行 retry check
5. 获取 recovery summary

如果你想直接体验当前显式命令面，而不是只跑测试：

```bash
cd /Users/gushuai/dev/Protocol30/goal-engine/agent-adapter
pnpm openclaw bootstrap
pnpm openclaw entrypoint "start goal" --payload '{"title":"Ship Goal Engine UX","successCriteria":["One explicit flow works"],"currentStage":"integration"}'
pnpm openclaw entrypoint "show goal status"
pnpm openclaw entrypoint "record failed attempt" --payload '{"stage":"integration","actionTaken":"Repeated the same path","strategyTags":["repeat"],"failureType":"stuck_loop"}'
pnpm openclaw entrypoint "check retry" --payload '{"plannedAction":"Repeat the same path again","whatChanged":"","strategyTags":["repeat"],"policyAcknowledged":true}'
pnpm openclaw entrypoint "recover current goal"
```

期望：

- 每一步都返回 JSON
- `summary` 字段是用户可读摘要
- 你不需要手写 Goal Engine HTTP 请求

## 7. 验证 adapter 工作流层

如果你要确认本地集成底座是否稳定：

```bash
cd /Users/gushuai/dev/Protocol30/goal-engine/agent-adapter
pnpm exec tsc --noEmit
pnpm test
```

这会验证：

- 工具封装
- projection orchestration
- 用户工作流
- 错误归一化

## 8. 最小 lifecycle 策略

当前最小自动化策略是：

- OpenClaw 启动时会自动读 `BOOT.md`
- agent bootstrap 时会自动注入 Goal Engine context 文件
- Goal Engine 工具调用仍保持显式
- `check retry` 是推荐前置，不是自动阻断
- `record failed attempt` 是失败后应立即执行的显式写回

这里的关键边界是：

- 当前不是“没有 hook”
- 当前是“没有足够语义化的 hook 来安全自动化 retry / failure”

## 9. 接下来怎么用

如果你的目的是真正把它接进 OpenClaw 使用，下一步应该看：

- `openclaw/README.md`
- `openclaw/goal-engine-entrypoints.md`
- `docs/goal-engine-openclaw-user-guide.md`

如果你的目的是判断“这项目有没有进入可体验阶段”，下一步应该看：

- `docs/checklists/goal-engine-openclaw-acceptance.md`

## 当前结论

现在这个仓库已经不是“只有 API 原型”了，但也还不是“普通用户产品”。

更准确的状态是：

- 对 OpenClaw 高级用户，已经开始具备可体验骨架
- 本地插件发现/加载已完成并做过真实验证
- 对普通用户，仍然不够
- 距离真正可直接使用，还差最后一公里的自动 lifecycle wiring
