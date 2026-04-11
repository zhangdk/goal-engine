# Goal Engine Entrypoints

## User-Facing Entrypoints

### `start goal`

Intent:

- begin a new long-running goal

Calls:

- adapter `dispatchEntrypoint` in `agent-adapter/src/openclaw/dispatch-entrypoint.ts`
- adapter `startGoalSession`

Reads/Writes:

- writes service goal state
- refreshes local projections

Returns:

- goal started summary
- current stage
- success criteria summary
- when a goal conflict exists, a summary of the current active goal plus explicit guidance to recover it or replace it with `replaceActiveGoal=true`

### `show goal status`

Intent:

- inspect the current goal, current guidance, and local projection state
- when a new task just arrived in OpenClaw, use it as the goal-alignment gate before search

Calls:

- adapter `dispatchEntrypoint` in `agent-adapter/src/openclaw/dispatch-entrypoint.ts`
- adapter `showGoalStatus`
- adapter `goalGetCurrent`
- adapter `policyGetCurrent` when available
- adapter `loadProjectionState`

Reads/Writes:

- reads current goal from service
- reads current guidance when available
- reads local projection files
- optionally reads `expectedGoalTitle` from the current OpenClaw task request
- writes a per-agent alignment snapshot into `.openclaw/runtime-state.json` so `/ui` can observe blocked goal alignment
- does not refresh projections during status inspection
- tells the user to run `recover current goal` when local projection files are missing

Returns:

- current goal summary
- latest guidance when available
- last failure summary from the local projection state
- local projection freshness summary
- when `expectedGoalTitle` differs from the service active goal, a blocked alignment summary plus the required next action (`start goal`, `replaceActiveGoal`, or `recover current goal`)
- when alignment is blocked, execution permission is denied for search, browsing, and other external tools until Goal Engine actions align the task
- when alignment is clear but `web_search` is unavailable, prefer the ready local `multi-search-engine` skill as the first fallback search path before declaring search unavailable

### `record failed attempt`

Intent:

- turn one failed run into updated guidance

Calls:

- adapter `dispatchEntrypoint` in `agent-adapter/src/openclaw/dispatch-entrypoint.ts`
- adapter `recordFailureAndRefresh`

Reads/Writes:

- writes attempt
- writes reflection
- refreshes projections

Returns:

- failure recorded confirmation
- updated guidance
- avoid strategies

### `recover current goal`

Intent:

- restore the minimum context needed to continue in a new session

Calls:

- adapter `dispatchEntrypoint` in `agent-adapter/src/openclaw/dispatch-entrypoint.ts`
- adapter `recoverGoalSession`
- adapter `loadProjectionState`

Reads/Writes:

- reads projection
- rebuilds projection when missing via adapter recovery workflow

Returns:

- current goal
- current stage
- last failure summary
- recommended next step

### `check retry`

Intent:

- check whether the next attempt is meaningfully different

Calls:

- adapter `dispatchEntrypoint` in `agent-adapter/src/openclaw/dispatch-entrypoint.ts`
- adapter `checkRetryAndExplain`

Reads/Writes:

- reads current policy via service-backed retry check
- does not mutate business state

Returns:

- allowed or blocked
- user-facing explanation
- raw reason code for debugging

## Session Bootstrap Rule

When OpenClaw starts a fresh session in this repo:

1. read `.openclaw/workspace-state.json`
2. inspect `examples/workspace/goal-engine/`
3. if projections exist, summarize them through `bootstrapSession` in `agent-adapter/src/openclaw/bootstrap-session.ts`
4. if projections do not exist but an active goal is expected, call `recover current goal`
5. if no active goal exists, show an empty state and suggest `start goal`

## CLI Invocation

Until full plugin/hook wiring exists, OpenClaw can call the adapter directly through:

- `cd agent-adapter && pnpm openclaw bootstrap`
- `cd agent-adapter && pnpm openclaw entrypoint "start goal" --payload '{"title":"Ship Goal Engine","successCriteria":["One flow works"]}'`
- `cd agent-adapter && pnpm openclaw entrypoint "start goal" --payload '{"title":"Ship Goal Engine","successCriteria":["One flow works"],"replaceActiveGoal":true}'`
- `cd agent-adapter && pnpm openclaw entrypoint "show goal status"`
- `cd agent-adapter && pnpm openclaw entrypoint "show goal status" --payload '{"expectedGoalTitle":"Find a meeting venue in Zhangjiang"}'`
- `cd agent-adapter && pnpm openclaw entrypoint "record failed attempt" --payload '{"stage":"integration","actionTaken":"Repeated the same path","strategyTags":["repeat"],"failureType":"stuck_loop"}'`
- `cd agent-adapter && pnpm openclaw entrypoint "recover current goal"`
- `cd agent-adapter && pnpm openclaw entrypoint "check retry" --payload '{"plannedAction":"Try again","whatChanged":"Changed the search path","strategyTags":["official-docs"],"policyAcknowledged":true}'`

Machine-readable command templates live in:

- `openclaw/commands.json`
