# Goal Engine OpenClaw Acceptance Checklist

## Goal

验证一个会安装 OpenClaw、但不想自己接 API 或手写配置的用户，是否能在 15 到 30 分钟内体验 Goal Engine 的长期目标闭环。

## Preconditions

- OpenClaw 已安装并可运行
- Goal Engine service 可本地启动
- 当前仓库已具备 OpenClaw 插件壳与显式入口约定

补充判断：

- 当前 acceptance 验证的是“插件已加载 + bootstrap context 已自动注入 + 显式 Goal Engine 工具可完成闭环”
- 当前不要求 OpenClaw 自动执行 `goal_engine_bootstrap`
- 当前也不要求 retry / failure 自动 hook，因为现有 hook 语义还不足以安全自动化这两件事

## Acceptance Steps

1. 启动 Goal Engine service
   期望：
   - 健康检查通过
   - 用户不需要手写 SQL 或直接调用数据库
   命令：
   - `cd service && pnpm dev`

2. 验证本地插件已加载
   期望：
   - `goal-engine` 插件处于 `loaded`
   - Goal Engine 6 个工具可见
   命令：
   - `openclaw plugins inspect goal-engine`

3. 通过 OpenClaw 显式入口开始一个目标
   期望：
   - 用户只需要提供目标标题、成功标准、当前阶段
   - 系统返回“goal started”类摘要
   - 本地 projection 自动生成
   命令：
   - `cd agent-adapter && pnpm openclaw entrypoint "start goal" --payload '{"title":"Ship Goal Engine UX","successCriteria":["One explicit OpenClaw flow works"],"currentStage":"integration"}'`

4. 查看当前目标状态
   期望：
   - 用户能看到当前目标、阶段、最近失败、下一步建议
   - 默认输出不是原始 HTTP envelope
   命令：
   - `cd agent-adapter && pnpm openclaw entrypoint "show goal status"`

5. 记录一次失败
   期望：
   - 用户不必手写 attempt 和 reflection 的原始 API payload
   - 写回后 guidance 更新
   - projection 自动刷新
   命令：
   - `cd agent-adapter && pnpm openclaw entrypoint "record failed attempt" --payload '{"stage":"integration","actionTaken":"Repeated the same path","strategyTags":["repeat"],"failureType":"stuck_loop"}'`

6. 在重复尝试前执行 retry check
   期望：
   - 系统明确告知 allowed 或 blocked
   - blocked 时给出可理解原因
   注意：
   - 这一步应在 `record failed attempt` 完成之后顺序执行，不应并行
   命令：
   - `cd agent-adapter && pnpm openclaw entrypoint "check retry" --payload '{"plannedAction":"Repeat the same path again","whatChanged":"","strategyTags":["repeat"],"policyAcknowledged":true}'`

7. 开启新 session 并恢复
   期望：
   - 用户能快速恢复目标和下一步建议
   - projection 丢失时可由 service 重建
   命令：
   - `cd agent-adapter && pnpm openclaw bootstrap`
   - `cd agent-adapter && pnpm openclaw entrypoint "recover current goal"`

## Done Bar

只有当下面这句话成立，才算达到可体验状态：

“一个会安装 OpenClaw、但不想自己接插件和写 API 的用户，可以在 15 到 30 分钟内完成接入，并成功跑通一次长期目标创建、失败写回、状态恢复的闭环。”
