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

## Search Engine Discovery Rule

For search engines, do not default to API-like fetches or static scraping.

- Avoid `web_fetch`, curl, or raw HTML scraping as the primary path for Google/Bing/Baidu/DuckDuckGo.
- Use a real browser path such as `agent-browser` or a paired browser node and read rendered results.
- If captcha/challenge appears, stop and write back the blocker. Do not try to bypass platform defenses.
- Treat `web_fetch-search` failure and `browser-operated-search` as different strategies for retry purposes.

## Goal Engine Reminder

For external goals:

1. bootstrap and inspect current status first
2. keep the current stage explicit
3. after a failed path, write back the failure
4. run retry check before repeating similar work
5. preserve only the minimum recovery summary
6. after a meaningful failure, run self-improvement logging and preserve any durable lesson into long-term memory

## Agent Evolution Reminder

If the task is explicitly about proving or improving an Agent's capability, treat any work done by a supervising Codex/Claude session as baseline support only.

- Do not count supervisor-found targets, emails, scripts, or decisions as Agent skill.
- The OpenClaw Agent must discover its own evidence and make its own bounded attempt.
- The supervisor may define constraints, approve/deny external actions, and inspect Goal Engine evidence.
- The learning loop only counts when the Agent writes failures/knowledge back and changes its next attempt because of the recovery packet.
