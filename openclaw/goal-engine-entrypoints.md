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

### `supervise external goal`

Intent:

- compile a rough external-world user task into an executable GoalContract
- start the supervised Goal Engine goal before the Agent does search, browsing, messaging, sales, or payment-related work
- prevent the Agent from asking the user to choose the strategy when the user has given an outcome and autonomy

Calls:

- adapter `dispatchEntrypoint` in `agent-adapter/src/openclaw/dispatch-entrypoint.ts`
- adapter `superviseExternalGoal`
- adapter `startGoalSession`
- OpenClaw plugin tool `goal_engine_supervise_external_goal`

Reads/Writes:

- reads the raw user task from payload `userMessage`
- writes a Goal Engine goal with evidence-oriented success criteria
- writes stop conditions for messaging, posting, identity use, payment, contracts, and false completion claims
- refreshes local projections
- writes an external tool guard requiring `show goal status` before external execution

Returns:

- external goal supervised summary
- compiled GoalContract title
- start-goal summary
- strategy guard guidance
- permission-boundary guidance
- required next action: call `show goal status` with the same goal title before external execution

### `record evidence`

Intent:

- record first-class proof, an artifact, a blocker, or an external confirmation for a goal
- keep completion proof separate from attempt prose

Calls:

- adapter `dispatchEntrypoint` in `agent-adapter/src/openclaw/dispatch-entrypoint.ts`
- adapter `evidenceRecord`
- service `POST /api/v1/evidence`

Reads/Writes:

- reads current active goal when `goalId` is not supplied
- writes an evidence record scoped to the requesting agent and goal

Valid evidence kinds:

- `artifact`
- `external_fact`
- `channel_check`
- `permission_boundary`
- `reply`
- `payment`
- `blocker`

Returns:

- evidence id
- evidence kind
- evidence summary
- if no goal can be inferred, a user-readable instruction to run `show goal status` or pass `goalId`

### `complete goal`

Intent:

- complete a goal through the evidence-referenced protocol
- avoid false completion claims that are not tied to Goal Engine evidence ids

Calls:

- adapter `dispatchEntrypoint` in `agent-adapter/src/openclaw/dispatch-entrypoint.ts`
- adapter `goalComplete`
- service `POST /api/v1/goals/:goalId/complete`

Reads/Writes:

- reads current active goal when `goalId` is not supplied
- writes a completion record and marks the goal completed atomically

Rules:

- pass at least one evidence id
- `blocker` evidence cannot complete a goal because it proves an obstacle, not success
- completion validates evidence ownership and basic admissibility; semantic sufficiency against every contract item is a later service verdict

Returns:

- completed goal title
- completion summary
- evidence ids used for completion

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
- `cd agent-adapter && pnpm openclaw entrypoint "supervise external goal" --payload '{"userMessage":"给你个任务，你要在一天内赚100元，方法不限。","receivedAt":"2026-04-13T07:18:32.373Z","replaceActiveGoal":true}'`
- `cd agent-adapter && pnpm openclaw entrypoint "show goal status"`
- `cd agent-adapter && pnpm openclaw entrypoint "show goal status" --payload '{"expectedGoalTitle":"Find a meeting venue in Zhangjiang"}'`
- `cd agent-adapter && pnpm openclaw entrypoint "record failed attempt" --payload '{"stage":"integration","actionTaken":"Repeated the same path","strategyTags":["repeat"],"failureType":"stuck_loop"}'`
- `cd agent-adapter && pnpm openclaw entrypoint "recover current goal"`
- `cd agent-adapter && pnpm openclaw entrypoint "check retry" --payload '{"plannedAction":"Try again","whatChanged":"Changed the search path","strategyTags":["official-docs"],"policyAcknowledged":true}'`

Machine-readable command templates live in:

- `openclaw/commands.json`
