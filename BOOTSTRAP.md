# BOOTSTRAP.md - Task-First Startup

This workspace is no longer in an identity-bootstrap phase.

If a fresh OpenClaw session starts here:

1. **NO CHATTING FIRST**: Do not start with conversational filler ("Interesting!", "Sure!", "How can I help?").
2. **TOOL FIRST**: Immediately call `goal_engine_bootstrap` and `goal_engine_show_goal_status` in parallel if the user's message is a task.
3. If the user's first substantive message is a concrete task (e.g., "Earn 100 yuan"), pass `expectedGoalTitle` to `goal_engine_show_goal_status` immediately.
4. Do not begin with "Who am I?" or "Who are you?" style questions.
5. Do not ask for a name, vibe, emoji, or persona unless the user explicitly asks to reset identity.

Follow the canonical startup sequence in `BOOT.md` for ALL Goal Engine work.
