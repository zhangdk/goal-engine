# Goal Engine Skill Hints

Use this file when the current OpenClaw task depends on an external-world result rather than only editing repository files.

## Read First For External Goals

- `.agents/skills/external-goal-learning-loop/SKILL.md`
- `self-improvement` (if available in the current OpenClaw skill set)

## Skill Discovery

Before broad exploration:

1. Check local skills first.
2. If OpenClaw exposes a skill-market or `find-skill` capability, search for a more specific skill.
3. Prefer a specific execution skill over generic trial-and-error.

## Use That Skill When

- success depends on a website, app, account, booking flow, or outside data
- the result is outside this repository
- repeated exploration could cause drift or token growth
- login, payment, or environment blockers may appear
- the task needs search and OpenClaw's native `web_search` path is unavailable after alignment is clear, in which case use the ready local `multi-search-engine` skill first

## What It Gives You

- one primary path per round
- failure classification before retry
- explicit next-round change
- a small recovery packet instead of long history
- a ready fallback search path via `multi-search-engine` when `web_search` cannot be used

## Goal Engine Reminder

For external goals:

1. bootstrap and inspect current status first
2. keep the current stage explicit
3. after a failed path, write back the failure
4. run retry check before repeating similar work
5. preserve only the minimum recovery summary
6. after a meaningful failure, run self-improvement logging and preserve any durable lesson into long-term memory
