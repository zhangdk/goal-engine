# Goal Engine OpenClaw Integration

This directory defines the first-pass OpenClaw-facing integration surface for Goal Engine.

The first user-testable version is explicit, not invisible:

- users intentionally start a goal
- users intentionally inspect status
- users intentionally record a failed attempt
- users intentionally recover a goal in a new session
- users intentionally run a retry check before repeating work

The integration must not require direct HTTP API knowledge.

## First-Pass Entrypoints

- `start goal`
- `show goal status`
- `record failed attempt`
- `recover current goal`
- `check retry`

## Backing Workflows

These user-facing entrypoints map to adapter workflows:

- `start goal` -> `startGoalSession`
- `show goal status` -> `showGoalStatus`
- `record failed attempt` -> `recordFailureAndRefresh`
- `recover current goal` -> `recoverGoalSession`
- `check retry` -> `checkRetryAndExplain`

`show goal status` reads the current goal, optional current guidance, and local projection state. If projection files are missing, it tells the user to run `recover current goal` instead of rebuilding during status inspection. When OpenClaw receives a new external task, pass `expectedGoalTitle` first and treat the result as a goal-alignment gate before doing any search or browsing. If the gate reports blocked alignment, that is a hard stop: no `web_search`, `web_fetch`, browser, or other external execution until Goal Engine actions align the task. Once alignment is clear, if `web_search` itself is unavailable or capability-blocked, switch to the ready local `multi-search-engine` skill as the preferred fallback search path before declaring search unavailable. If that fallback also fails to produce valid evidence, immediately write the failure back through `record failed attempt` before summarizing the blocker.

`start goal` is now conflict-aware. If an active goal already exists, the adapter returns the current active goal title and stage instead of only a generic error. The caller must then choose between:

- recovering / continuing the current goal
- explicitly replacing it with `replaceActiveGoal=true`

## Session Bootstrap

On a new OpenClaw session:

1. Read local projection state under `examples/workspace/goal-engine/`
2. If an active goal is expected, call recovery workflow
3. If local projection is missing or stale, use `recover current goal` to rebuild it from service
4. Show a restart-safe summary instead of raw JSON

## Scope Notes

This directory now has a minimal plugin shell for OpenClaw discovery and explicit tool registration.

The current baseline is:

- plugin discovery and loading are implemented
- explicit Goal Engine tools are implemented
- bootstrap context injection is implemented through built-in OpenClaw hooks
- automatic lifecycle execution is still not implemented
- OpenClaw plugin hooks exist, but current retry/failure hook semantics are not strong enough for safe Goal Engine automation

It is the source of truth for:

- entrypoint naming
- user-visible behavior
- session bootstrap expectations

## Runtime Wiring

The first-pass executable wiring now lives in `agent-adapter`:

- dispatch layer: `agent-adapter/src/openclaw/dispatch-entrypoint.ts`
- bootstrap layer: `agent-adapter/src/openclaw/bootstrap-session.ts`
- CLI surface: `agent-adapter/src/openclaw/cli.ts`
- machine-readable command map: `openclaw/commands.json`
- local plugin entry: `index.ts` + `openclaw.plugin.json`

These modules keep OpenClaw explicit and debuggable:

- OpenClaw asks for a user-facing entrypoint by name
- the adapter resolves active-goal details when needed
- the adapter returns user-facing summaries instead of raw envelopes
- session bootstrap reads `.openclaw/workspace-state.json` and chooses status vs recovery
- active-goal conflicts are surfaced as summaries, not hidden as generic 409s

Current direct invocation surface:

- `cd agent-adapter && pnpm openclaw bootstrap`
- `cd agent-adapter && pnpm openclaw entrypoint "show goal status"`
- `cd agent-adapter && pnpm openclaw entrypoint "show goal status" --payload '{"expectedGoalTitle":"..."}'`
- `cd agent-adapter && pnpm openclaw entrypoint "start goal" --payload '{"title":"...","successCriteria":["..."]}'`

When replacing an existing active goal on purpose:

- `cd agent-adapter && pnpm openclaw entrypoint "start goal" --payload '{"title":"...","successCriteria":["..."],"replaceActiveGoal":true}'`

If OpenClaw needs a config artifact instead of prose, use:

- `openclaw/commands.json` for exact command templates
- `.openclaw/workspace-state.json` for bootstrap/runtime defaults

## Minimal Lifecycle Policy

This is the current intended behavior:

- `BOOT.md` is loaded on `gateway:startup` to explain Goal Engine bootstrap expectations
- `bootstrap-extra-files` is loaded on `agent:bootstrap` to inject Goal Engine context files
- `goal_engine_bootstrap` remains an explicit tool even after context injection
- `supervise external goal`, `start goal`, `show goal status`, `recover current goal`, `record failed attempt`, and `check retry` remain explicit tools
- when a rough external-world task arrives, use `goal_engine_supervise_external_goal` to compile it into a GoalContract before search, browsing, messaging, sales, or payment-related work
- when a new external task may conflict with an active goal, `show goal status` with `expectedGoalTitle` is the required alignment gate; if it reports blocked alignment, do not continue execution until the goal is recovered, replaced, or explicitly restarted
- while alignment is blocked, do not call search, browsing, or other external execution tools; only Goal Engine alignment actions are allowed
- `check retry` is recommended before repeating a path, but is not automatically enforced
- `record failed attempt` is a required explicit write-back after a confirmed failure, but is not automatically triggered
- when a search path is needed after alignment is clear, prefer `web_search`; if it is unavailable, use the ready local `multi-search-engine` skill before giving up on search entirely
- if `web_search` and the fallback search path both fail, call `record failed attempt` before reporting the blocker so the failure becomes visible to Goal Engine and `/ui`

This keeps the integration debuggable while the repo waits for a more semantic retry/failure hook surface.
