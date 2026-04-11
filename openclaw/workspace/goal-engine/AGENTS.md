# Goal Engine OpenClaw Context

This workspace subtree exists to support OpenClaw bootstrap and projection-aware Goal Engine usage.

Use it for:

- projection-only context under `examples/workspace/goal-engine/`
- Goal Engine bootstrap expectations
- restart-safe reminders for the explicit Goal Engine tools

Preferred tool order inside OpenClaw:

1. `goal_engine_bootstrap`
2. `goal_engine_show_goal_status`
3. if a new task just arrived, pass that task title as `expectedGoalTitle` and stop if alignment is blocked
4. `goal_engine_start_goal` or `goal_engine_recover_current_goal`

After failure:

1. `goal_engine_record_failed_attempt`
2. `goal_engine_check_retry`
3. before the next external attempt, explicitly say all three lines in natural language:
   - `do_not_repeat=...`
   - `new_path=...`
   - `why_better_than_last_round=...`
4. then execute exactly one new path

When the current task is an external goal, such as ordering, booking, comparing real-world options, or reaching a pre-confirmation page outside the repo:

1. Read `openclaw/workspace/goal-engine/SKILLS.md`
2. Search for a more specific local skill first; if OpenClaw offers a skill-market or `find-skill`, use that before improvising
3. Prefer the listed reusable skill before broad exploration
4. Keep each attempt small and single-path
5. Do not repeat the same blocked path without a retry check
6. After a meaningful failure, log the lesson through `self-improvement` and preserve durable takeaways into long-term memory when appropriate
7. A new external task must not skip goal alignment: run `goal_engine_show_goal_status` with `expectedGoalTitle` first, and if it reports blocked alignment, update the active goal before doing any search
8. If `goal_engine_show_goal_status` reports blocked alignment, treat that as a hard stop:
   - do not call `web_search`, `web_fetch`, browser actions, or other external execution tools
   - only use Goal Engine actions needed to align the active goal
9. If alignment is clear but `web_search` is unavailable, use the ready local `multi-search-engine` skill as the preferred fallback search path before declaring search unavailable
10. If the fallback search path also fails, or it runs but still cannot produce page-level evidence, immediately call `goal_engine_record_failed_attempt` before reporting the blocker
   - use `tool_unavailable` for broken or missing search capability
   - use `strategy_mismatch` when the search path ran but cannot satisfy the success criteria
   - include concrete `actionTaken` text so the next retry can avoid repeating the same path
11. Do not hide the next-round change inside tool arguments only. After every failed round and before any new external execution, restate the next attempt in plain language with `do_not_repeat`, `new_path`, and `why_better_than_last_round`
12. If retry check allows a new attempt, the next user-visible text should still name the single chosen path before any search, browser, or exec tool runs

The projection files are summaries only. They must not become a second fact store.
