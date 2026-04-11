# Goal Engine Boot

If the `goal-engine` plugin is available in OpenClaw, treat it as the canonical bridge for Goal Engine session bootstrap.

On startup in this workspace:

1. Prefer calling `goal_engine_bootstrap` before manually inspecting Goal Engine state.
2. Use the current OpenClaw runtime identity for `agentId`, `agentName`, `workspace`, and `session` when available.
3. After bootstrap, prefer:
   - `goal_engine_show_goal_status` to inspect state
   - `goal_engine_start_goal` to begin work
   - `goal_engine_record_failed_attempt` after a failed path
   - `goal_engine_check_retry` before repeating a blocked or similar path
   - `goal_engine_recover_current_goal` when projection is missing or stale
4. When a new external-world task arrives in OpenClaw, do not search first. Call `goal_engine_show_goal_status` with `expectedGoalTitle` set to the new task title and treat the result as a goal-alignment gate.
5. If goal alignment is blocked:
   - stop execution
   - explicitly choose `goal_engine_start_goal`, `replaceActiveGoal`, or `goal_engine_recover_current_goal`
   - only continue searching after the active goal is aligned
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
