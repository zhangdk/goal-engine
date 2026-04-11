# Goal Engine OpenClaw Lifecycle Smoke Checklist

**Date:** 2026-04-06

## Goal

验证当前仓库已经具备这条最小真实运行路径：

1. OpenClaw 可以发现并加载 Goal Engine 插件
2. OpenClaw 启动与 agent bootstrap 会注入 Goal Engine bootstrap context
3. Goal Engine 6 个工具仍保持显式调用
4. 在真实 plugin 已加载的前提下，adapter CLI 可以完成 `bootstrap -> start goal -> show goal status -> record failed attempt -> check retry -> recover current goal`

## Preconditions

- OpenClaw 已安装
- Goal Engine 仓库已执行 `./scripts/install-local.sh`
- Goal Engine service 可本地启动

## Smoke Steps

### 1. 验证插件已加载

命令：

- `openclaw plugins inspect goal-engine`

期望：

- `Status: loaded`
- 工具列表包含：
  - `goal_engine_bootstrap`
  - `goal_engine_start_goal`
  - `goal_engine_show_goal_status`
  - `goal_engine_record_failed_attempt`
  - `goal_engine_recover_current_goal`
  - `goal_engine_check_retry`

### 2. 验证 bootstrap hooks 已开启

命令：

- 读取 `~/.openclaw/openclaw.json`

期望：

- `hooks.internal.enabled = true`
- `hooks.internal.entries.boot-md.enabled = true`
- `hooks.internal.entries.bootstrap-extra-files.enabled = true`
- `bootstrap-extra-files.paths` 包含：
  - `AGENTS.md`
  - `SOUL.md`
  - `USER.md`
  - `BOOT.md`
  - `openclaw/workspace/goal-engine/AGENTS.md`

### 3. 用临时 DB 和临时 state 文件启动 service

推荐命令：

```bash
mkdir -p /tmp/goal-engine-smoke
cp .openclaw/workspace-state.json /tmp/goal-engine-smoke/workspace-state.json
rm -f /tmp/goal-engine-smoke/runtime-state.json /tmp/goal-engine-smoke/service.db
cd service
PORT=3310 DB_PATH=/tmp/goal-engine-smoke/service.db pnpm dev
```

健康检查：

```bash
curl -sf http://127.0.0.1:3310/api/v1/health
```

### 4. 顺序验证显式 Goal Engine 路径

注意：

- 这一步必须顺序执行
- 不要把 `record failed attempt`、`check retry`、`recover current goal` 并行跑
- `check retry` 依赖前一步已经写入 policy

命令：

```bash
cd agent-adapter
pnpm openclaw bootstrap --service-url http://127.0.0.1:3310 --workspace-state /tmp/goal-engine-smoke/workspace-state.json --runtime-state /tmp/goal-engine-smoke/runtime-state.json --agent-id smoke-agent --agent-name "Smoke Agent" --workspace /tmp/goal-engine-smoke --session smoke-session-1
pnpm openclaw entrypoint "start goal" --service-url http://127.0.0.1:3310 --workspace-state /tmp/goal-engine-smoke/workspace-state.json --runtime-state /tmp/goal-engine-smoke/runtime-state.json --agent-id smoke-agent --agent-name "Smoke Agent" --workspace /tmp/goal-engine-smoke --session smoke-session-1 --payload '{"title":"Goal Engine smoke validation","successCriteria":["Bootstrap and explicit entrypoints work together"],"currentStage":"smoke"}'
pnpm openclaw entrypoint "show goal status" --service-url http://127.0.0.1:3310 --workspace-state /tmp/goal-engine-smoke/workspace-state.json --runtime-state /tmp/goal-engine-smoke/runtime-state.json --agent-id smoke-agent --agent-name "Smoke Agent" --workspace /tmp/goal-engine-smoke --session smoke-session-1
pnpm openclaw entrypoint "record failed attempt" --service-url http://127.0.0.1:3310 --workspace-state /tmp/goal-engine-smoke/workspace-state.json --runtime-state /tmp/goal-engine-smoke/runtime-state.json --agent-id smoke-agent --agent-name "Smoke Agent" --workspace /tmp/goal-engine-smoke --session smoke-session-1 --payload '{"stage":"smoke","actionTaken":"Repeated the same path","strategyTags":["repeat"],"failureType":"stuck_loop"}'
pnpm openclaw entrypoint "check retry" --service-url http://127.0.0.1:3310 --workspace-state /tmp/goal-engine-smoke/workspace-state.json --runtime-state /tmp/goal-engine-smoke/runtime-state.json --agent-id smoke-agent --agent-name "Smoke Agent" --workspace /tmp/goal-engine-smoke --session smoke-session-1 --payload '{"plannedAction":"Repeat the same path again","whatChanged":"","strategyTags":["repeat"],"policyAcknowledged":true}'
pnpm openclaw entrypoint "recover current goal" --service-url http://127.0.0.1:3310 --workspace-state /tmp/goal-engine-smoke/workspace-state.json --runtime-state /tmp/goal-engine-smoke/runtime-state.json --agent-id smoke-agent --agent-name "Smoke Agent" --workspace /tmp/goal-engine-smoke --session smoke-session-2
```

期望：

- `bootstrap` 返回 restart-safe summary
- `start goal` 返回 goal started 摘要
- `show goal status` 返回当前 goal、stage、projection 状态
- `record failed attempt` 返回 guidance 更新摘要
- `check retry` 返回 `blocked_strategy_overlap`
- `recover current goal` 在新 session 下返回 recovery summary

## Verified Result On 2026-04-06

本仓库已按上面路径完成一次真实 smoke 验证：

- `openclaw plugins inspect goal-engine` 通过
- `boot-md` 与 `bootstrap-extra-files` 已在 `~/.openclaw/openclaw.json` 启用
- 临时 service 运行于 `http://127.0.0.1:3310`
- 顺序执行后，6 个 Goal Engine 路径全部返回预期摘要

边界说明：

- 当前验证的是“插件已加载 + bootstrap context 已自动注入 + 显式工具路径可用”
- 当前还没有验证 “OpenClaw 自动执行 `goal_engine_bootstrap`”
- 当前也没有 retry / failure 的自动 hook 执行
