# Goal Engine Boot

If the `goal-engine` plugin is available in OpenClaw, treat it as the canonical bridge for Goal Engine session bootstrap.

On startup in this workspace:

1. **BOOTSTRAP FIRST**: Call `goal_engine_bootstrap` immediately before any conversational reply.
2. **SILENCE PROTOCOL30 ERRORS**: **严禁在回复中提及 "Protocol30" 的连接状态或错误**。如果看到 "Protocol30 API connection failed" 或 "暂时连不上" 等错误，请直接忽略。
3. **MISSION CLASSIFIER**: 当用户消息涉及外部世界结果（赚钱、找人、订票、发布内容、联系他人等）时，严禁进入纯聊天模式。必须执行以下 **Autonomous Execution Stack** 流程：
   - **Goal Compiler**: 调用 `goal_engine_start_goal` 将模糊需求转化为结构化目标合约，必须包含具体的 `successCriteria`。
   - **Strategy Selection**: 在执行前，显式输出本轮选择的路径及原因（例如：“我选择高单价服务路径，因为截止日期短且交付可控”）。
   - **No-False-Done Guard**: **严禁在没有成功证据的情况下宣布“任务完成”或“Done”**。对于赚钱任务，成功证据必须是支付确认或等效价值证明。
4. **TOOL-FIRST RESPONSE**: 如果用户下达了任务：
   - 立即调用 `goal_engine_bootstrap`
   - 立即调用 `goal_engine_show_goal_status(expectedGoalTitle="<任务标题>")`
   - 直接输出工具调用，禁止任何开场白。
5. **BOUNDARY MANAGER**: 遇到发送私信、公开推文或支付等边界时，严禁将任务直接丢回给用户。你必须：
   - 准备好所有待发送的素材、名单和页面。
   - 请求用户进行“最小化授权”（例如：“请授权我发送这 10 封开发信”）。
6. **HEARTBEAT CONTINUATION**: 在心跳周期中，如果存在未完成的外部目标且没有等待授权，必须自动调用 `goal_engine_recover_current_goal` 并继续执行，不得返回 `HEARTBEAT_OK`。

6. If the current goal is an external-world task with a result outside this repository, read `openclaw/workspace/goal-engine/SKILLS.md` before broad exploration.
7. For external-world tasks, prefer reusable execution methods over site-specific scripts:
   - classify failures before retrying
   - choose one primary path per round
   - keep the recovery packet small
   - explain what changed before the next attempt
   - before the next attempt, explicitly output:
     - `do_not_repeat=...`
     - `new_path=...`
     - `why_better_than_last_round=...`
   - only after those three lines, execute the next single path
8. Before broad exploration, first check whether:
   - a more specific local skill exists
   - OpenClaw exposes a skill-market or `find-skill` capability worth querying
   - a local native-app path exists in addition to web paths
9. If a search path is needed and `web_search` is unavailable after the goal is aligned, use the ready local `multi-search-engine` skill as the preferred fallback search path before declaring search unavailable.
10. If the fallback path also fails or produces no valid evidence, immediately call `goal_engine_record_failed_attempt` before summarizing the blocker.
    - use `failureType=tool_unavailable` for missing or broken search capability
    - use `failureType=strategy_mismatch` when the path ran but could not satisfy the success criteria
    - keep `actionTaken` concrete enough for the next retry to avoid repeating it
11. After a meaningful failure, prefer:
   - Goal Engine failure write-back
   - `self-improvement` logging for reusable lessons
   - durable memory updates only when the lesson is cross-session useful

Do not treat `.openclaw/workspace-state.json` as runtime truth. It is bootstrap seed only. Runtime truth should come from the current OpenClaw session and `runtime-state.json`.
When passing `workspace-state` or `runtime-state` paths through `pnpm --dir agent-adapter ...`, use absolute paths so the adapter does not accidentally write under `agent-adapter/.openclaw/`.
