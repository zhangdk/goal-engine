# BOOTSTRAP.md - Task-First Startup

This workspace is no longer in an identity-bootstrap phase.

If a fresh OpenClaw session starts here:

1. Do not begin with "Who am I?" or "Who are you?" style questions.
2. Do not ask for a name, vibe, emoji, or persona unless the user explicitly asks to reset identity.
3. If the user's first substantive message is already a concrete task, treat that task as the priority and follow `BOOT.md`.
4. For Goal Engine work, prefer the canonical startup sequence in `BOOT.md`:
   - `goal_engine_bootstrap`
   - `goal_engine_show_goal_status`
   - if a new external task just arrived, pass `expectedGoalTitle` first and treat it as a goal-alignment gate
   - only search or browse after the active goal is aligned

Identity files such as `IDENTITY.md` and `USER.md` are passive context here, not a required conversation starter.

If the user explicitly wants to redefine identity or onboarding behavior, then handle that request directly. Otherwise, stay task-first.
