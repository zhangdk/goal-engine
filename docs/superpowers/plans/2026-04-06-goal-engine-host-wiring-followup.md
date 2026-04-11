# Goal Engine Host Wiring Follow-up Plan

**Date:** 2026-04-06  
**Scope:** 在已完成 Goal Engine OpenClaw 插件壳、插件发现、工具注册和本地安装验证的基础上，收敛剩余自动 lifecycle wiring 工作。

## Goal

把剩余工作从“宿主能否发现 Goal Engine”收敛为：

- 自动 `bootstrap` 接线
- retry / failure 生命周期接线评估
- 文档和状态收口

不再扩展新的 Goal Engine 业务能力。

## Current State

已完成：

- Goal Engine OpenClaw 插件壳
- `goal-engine` 插件可被 OpenClaw 本地安装、发现、加载
- 6 个显式 Goal Engine 工具已注册
- `scripts/install-local.sh` 可写入本地 OpenClaw 配置
- `bootstrap-extra-files` 已配置 Goal Engine 所需 bootstrap 文件
- 已完成本机 smoke 验证：
  - `openclaw plugins install -l /Users/gushuai/dev/Protocol30/goal-engine`
  - `openclaw plugins list`
  - `openclaw plugins inspect goal-engine`

未完成：

- 自动 `goal_engine_bootstrap` 生命周期接线
- retry guard 自动触发策略
- failure writeback 自动触发策略
- 系统规划文档状态同步

## Task List

### Task 1: Re-baseline G3 status

目标：

- 明确 G3 已完成部分与未完成部分

子任务：

- [x] 把 “宿主未接线” 改写为 “插件发现/加载已完成，自动 lifecycle wiring 未完成”
- [x] 统一 README、Quickstart、User Guide 中的状态描述
- [x] 明确哪些结论来自真实本机验证

验收：

- 所有主文档不再把 G3 描述成“完全未开始”

### Task 2: Define minimal lifecycle automation

目标：

- 只定义最小必要自动化，不引入过度 hook

子任务：

- [x] 明确 `goal_engine_bootstrap` 的自动触发时机
- [x] 明确 `goal_engine_check_retry` 是强制前置还是推荐前置
- [x] 明确失败后是自动调用 `goal_engine_record_failed_attempt` 还是只提示
- [x] 保留哪些工具为显式调用

验收：

- 形成一份清晰的 lifecycle 决策表

## Minimal Lifecycle Decision Table

| Lifecycle 点 | 当前策略 | 原因 |
| --- | --- | --- |
| OpenClaw `gateway:startup` | 通过 `BOOT.md` 自动注入 Goal Engine 启动说明 | 这是当前已验证可用的最小自动化，适合放约定和入口说明 |
| OpenClaw `agent:bootstrap` | 通过 `bootstrap-extra-files` 自动注入 Goal Engine bootstrap context | 已由内置 hook 支持，不需要额外宿主代码 |
| `goal_engine_bootstrap` | 保留为显式工具，不做强制自动调用 | 当前 hook 只能注入上下文文件，不能可靠替代带参数的工具执行 |
| `goal_engine_start_goal` | 显式调用 | 这是明确的用户动作，不应隐式触发 |
| `goal_engine_show_goal_status` | 显式调用 | 查询类动作应保持可调试、可重放 |
| `goal_engine_check_retry` | 推荐前置，不做强制阻断 | 现有 hook 面未暴露稳定的 retry 前强制点 |
| `goal_engine_record_failed_attempt` | 失败后显式调用，文档中强提醒 | 失败确认通常依赖用户语义判断，自动触发容易误记 |
| `goal_engine_recover_current_goal` | 显式调用 | 恢复需要用户确认当前 session 目标，不适合静默执行 |

结论：

- 当前最小自动化只覆盖 bootstrap context 注入
- Goal Engine 工具执行仍以显式调用为主
- retry / failure 自动化继续列为后续任务，前提是 OpenClaw 暴露稳定 hook 点

### Task 3: Implement automatic bootstrap wiring

目标：

- 让 Goal Engine 在 OpenClaw 启动/agent bootstrap 阶段自动进入可用状态

子任务：

- [x] 复用现有 OpenClaw hook 能力实现最小自动 bootstrap
- [x] 验证当前 workspace 启动时会注入 Goal Engine bootstrap context
- [x] 确保 `workspace-state.json` 仍只作为 seed，不被误当 runtime truth

验收：

- 新 session 下无需人工先读散落文档，即可进入 Goal Engine 正确启动路径

### Task 4: Validate runtime lifecycle behavior

目标：

- 对当前插件加载后的真实运行路径做 smoke 验证

子任务：

- [x] 增加一条插件安装后 lifecycle smoke checklist
- [x] 验证插件已加载后 `goal_engine_bootstrap` 可用
- [x] 验证启动后能继续显式调用 5 个 Goal Engine entrypoint 工具

验收：

- 有一条可重复执行的真实运行路径验证记录

### Task 5: Evaluate retry/failure hook feasibility

目标：

- 判断 OpenClaw 现有 hook 面是否足以覆盖 retry / failure 自动化

子任务：

- [x] 调查是否存在 retry 前可挂载的 hook 点
- [x] 调查是否存在失败后可挂载的 hook 点
- [x] 如果存在，给出最小实现方案
- [x] 如果不存在，明确标注为平台 hook 能力缺口

验收：

- retry / failure 自动化不再停留在泛泛而谈

## Task 5 Conclusion

技术验证结果：

- `openclaw hooks list` 只暴露 4 个内置 internal hooks：
  - `boot-md`
  - `bootstrap-extra-files`
  - `command-logger`
  - `session-memory`
- 这 4 个内置 hook 都不提供 retry 前或 failure 后的直接挂点
- OpenClaw plugin SDK 确实暴露了插件级 hook 注册能力：
  - `registerHook(...)`
  - 可注册的 plugin lifecycle 包括：
    - `before_dispatch`
    - `before_agent_start`
    - `before_tool_call`
    - `after_tool_call`
    - `agent_end`
    - `session_start`
    - `session_end`
    - `gateway_start`
    - `gateway_stop`

判断：

- **retry 自动化：部分可行，但不够稳**
  - 理论上可以用 `before_tool_call`
  - 但当前事件只提供 `toolName` 和 `params`
  - Goal Engine 的 retry check 还需要：
    - `plannedAction`
    - `whatChanged`
    - `strategyTags`
    - `policyAcknowledged`
  - 这些关键语义并不在通用 tool hook 里，无法对“重复路径”做可靠判断
  - 因此不能把它实现成稳定的全局自动阻断

- **failure 自动化：不适合自动写回**
  - `after_tool_call` 和 `agent_end` 可以看到工具报错或整轮失败
  - 但 Goal Engine 的 failed attempt 写回需要：
    - `stage`
    - `actionTaken`
    - `failureType`
    - 可选 `nextHypothesis`
  - 这些都依赖任务语义和用户判断，不能从通用 hook 事件安全推导
  - 自动写回容易把“工具报错”误记成“目标推进失败”

最小实现方案：

- 保持当前策略不变：
  - `check retry` 继续做显式前置工具
  - `record failed attempt` 继续做失败后的显式写回工具
- 如果后续要试更强自动化，唯一合理的低风险方向是：
  - 在 `before_agent_start` 或 `before_dispatch` 注入提醒性上下文
  - 提醒模型在重复路径前调用 `goal_engine_check_retry`
  - 提醒模型在确认失败后调用 `goal_engine_record_failed_attempt`
- 不建议在当前阶段做：
  - 全局 `before_tool_call` 自动阻断
  - `after_tool_call` 自动写 failed attempt

结论：

- 这不是“OpenClaw 完全没有 hook 能力”
- 这是“OpenClaw 已有 plugin hooks，但当前事件语义不足以支撑 Goal Engine 想要的 retry / failure 自动化”
- 因此 retry / failure 自动化应标记为 **平台 hook 语义缺口 + 当前版本显式调用保留**

### Task 6: Update docs and plans

目标：

- 让规划文档和现状重新一致

子任务：

- [x] 更新 `README.md`
- [x] 更新 `openclaw/README.md`
- [x] 更新 `docs/goal-engine-openclaw-quickstart.md`
- [x] 更新 `docs/goal-engine-openclaw-user-guide.md`
- [x] 更新 `docs/superpowers/specs/2026-04-06-goal-engine-system-planning-design.md`
- [x] 更新 `docs/superpowers/plans/2026-04-06-goal-engine-system-planning.md`

验收：

- 文档能准确表达：
  - 插件发现/加载已完成
  - 自动 lifecycle wiring 未完成

### Task 7: Final regression

目标：

- 在文档和接线收口后做一次完整复验

子任务：

- [x] `cd agent-adapter && pnpm exec tsc --noEmit`
- [x] `cd agent-adapter && pnpm test`
- [x] `cd service && pnpm exec tsc --noEmit`
- [x] `cd service && pnpm test`
- [x] `cd service && pnpm test:e2e`
- [x] `openclaw plugins inspect goal-engine`

验收：

- 代码、测试、插件加载状态全部通过

## Execution Order

按以下顺序执行：

1. Task 1: Re-baseline G3 status
2. Task 2: Define minimal lifecycle automation
3. Task 3: Implement automatic bootstrap wiring
4. Task 4: Validate runtime lifecycle behavior
5. Task 5: Evaluate retry/failure hook feasibility
6. Task 6: Update docs and plans
7. Task 7: Final regression

## Success Line

当下面这句话成立时，剩余 Host Wiring 工作才算真正收口：

**OpenClaw 已能发现并加载 Goal Engine 插件；新 session 进入该 workspace 时会自动获得 Goal Engine bootstrap context；用户可继续通过显式 Goal Engine 工具完成目标创建、失败写回、重试检查和恢复，而文档状态与实际实现完全一致。**
