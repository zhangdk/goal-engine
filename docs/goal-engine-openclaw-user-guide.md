# Goal Engine OpenClaw User Guide

## 目标用户

这份指南面向：

- 会安装 OpenClaw
- 不想自己手写 Goal Engine API
- 愿意通过显式入口体验长期目标控制

## 入口总览

第一版显式入口：

- `start goal`
- `show goal status`
- `record failed attempt`
- `recover current goal`
- `check retry`

这些入口对应的行为约定见：

- `openclaw/goal-engine-entrypoints.md`
- `openclaw/README.md`

当前已完成：

- 本地 OpenClaw 插件发现与加载
- Goal Engine 6 个工具注册
- `BOOT.md` 和 bootstrap context 文件注入

当前未完成：

- 自动执行 `goal_engine_bootstrap`
- retry / failure 生命周期自动化

这里的原因不是 OpenClaw 完全没有 hook，而是当前 hook 事件不包含足够稳定的业务语义，无法安全自动推断：

- 这次重试是否真的和上次不同
- 这次失败是否应写成 Goal Engine failed attempt

当前本地命令面：

```bash
cd /Users/gushuai/dev/Protocol30/goal-engine/agent-adapter
pnpm openclaw bootstrap
pnpm openclaw entrypoint "show goal status"
```

## 生命周期约定

当前最小 lifecycle 约定是：

- OpenClaw 启动时自动读取 `BOOT.md`
- agent bootstrap 时自动注入 Goal Engine context 文件
- Goal Engine 工具仍保持显式调用
- `check retry` 是推荐前置
- `record failed attempt` 是失败后的显式写回

这意味着：

- 当前不是“没有 hook”
- 当前是“没有足够语义化的 hook 来安全自动化 retry / failure”

## 流程 1：开始一个长期目标

你需要提供最少信息：

- 目标标题
- 成功标准
- 当前阶段

你应该得到：

- 目标已开始的确认
- 当前阶段
- 成功标准摘要
- 已刷新恢复摘要

如果失败：

- `state_conflict` 意味着当前已有 active goal
- `validation_error` 意味着输入字段不完整
- `service_unavailable` 意味着本地 service 没启动或不可达

如果遇到 `state_conflict`，当前行为不再只是返回“冲突”：

- 系统会告诉你当前 active goal 的标题和阶段
- 如果你只是想继续旧 goal，应先 `show goal status` 或 `recover current goal`
- 只有在你明确要放弃旧 goal 时，才应传 `replaceActiveGoal=true`

当前命令模板：

```bash
pnpm openclaw entrypoint "start goal" --payload '{"title":"Ship Goal Engine UX","successCriteria":["One explicit flow works"],"currentStage":"integration"}'
```

明确替换当前 active goal：

```bash
pnpm openclaw entrypoint "start goal" --payload '{"title":"Ship Goal Engine UX","successCriteria":["One explicit flow works"],"currentStage":"integration","replaceActiveGoal":true}'
```

## 流程 2：查看当前状态

你应该看到的重点不是全量历史，而是：

- 当前目标
- 当前阶段
- 最近失败摘要
- 当前策略建议
- 推荐下一步

如果当前没有 active goal：

- 应返回明确空状态
- 系统应该建议你使用 `start goal`

当前命令模板：

```bash
pnpm openclaw entrypoint "show goal status"
```

## 流程 3：记录一次失败

当你确认这轮失败时，应显式记录这次失败，而不是只留在对话里。

记录失败后，系统应该完成：

1. 写入 attempt
2. 写入 reflection
3. 更新 policy
4. 刷新 projection

你应该看到：

- 当前更新后的 guidance
- 新增的 avoid strategies
- 推荐下一步

这一步的核心价值是：

失败不只是日志，而是会改变下一轮行为约束。

当前命令模板：

```bash
pnpm openclaw entrypoint "record failed attempt" --payload '{"stage":"integration","actionTaken":"Repeated the same path","strategyTags":["repeat"],"failureType":"stuck_loop"}'
```

## 流程 4：重试前检查

在重复尝试前，执行 `check retry`。

你要提供：

- 计划做什么
- 这次和上次相比改了什么
- 当前策略标签
- 是否已阅读当前 guidance

你应该得到：

- 是否允许继续
- 如果不允许，为什么
- 如果允许，说明这次变化已经足够

这一步的核心价值是：

防止“看起来在继续，其实在重复撞墙”。

当前命令模板：

```bash
pnpm openclaw entrypoint "check retry" --payload '{"plannedAction":"Repeat the same path again","whatChanged":"","strategyTags":["repeat"],"policyAcknowledged":true}'
```

## 流程 5：新 session 恢复

在新 session 中，执行 `recover current goal`。

你应该看到：

- 当前目标
- 当前阶段
- 最近失败摘要
- 当前禁止重复的策略
- 推荐下一步

如果 projection 丢失：

- 系统应优先从 service 重建
- 不应把本地文件当作主数据库

当前命令模板：

```bash
pnpm openclaw bootstrap
pnpm openclaw entrypoint "recover current goal"
```

## Projection 文件

projection 默认在：

```text
examples/workspace/goal-engine/
```

这些文件只能保存摘要，不应承载事实库。

如果你发现里面出现：

- 全量 attempts
- 全量 reflections
- policy 历史

那就是实现偏了。

## 常见问题

### 为什么我不能直接开始第二个 goal？

因为当前 v0/v1 过渡阶段仍然按单 active goal 设计。已有 active goal 时，创建新 goal 会冲突。

现在系统会把这个冲突明确显示出来，而不是只给模糊错误。你需要做的是二选一：

- 继续 / 恢复当前 goal
- 明确放弃当前 goal，再用 `replaceActiveGoal=true` 启动新 goal

### 为什么没有图形界面？

因为当前目标是让 OpenClaw 高级用户先直接体验长期目标控制层，不是做独立 UI 产品。

### 为什么还需要显式入口？

因为当前版本只把自动化收敛到 bootstrap context 注入，工具执行仍追求“可验证、可排错、可学习”，不是一上来就做完全无感知自动化。

### 我是不是还在用开发者原型？

是，但已经不是只有裸 API 的原型。现在已有：

- 本地插件壳和真实加载验证
- 用户入口语义
- 本地 workflow 底座
- projection 刷新
- session 恢复
- 用户流 E2E

## 你应该怎么判断这版是否值得继续做

只看这一句是否成立：

“一个会安装 OpenClaw、但不想自己接插件和写 API 的用户，可以在 15 到 30 分钟内完成接入，并成功跑通一次长期目标创建、失败写回、状态恢复的闭环。”

如果成立，方向可继续。

如果不成立，优先补的是自动 lifecycle wiring，不是继续扩更多能力。
