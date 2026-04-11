# Goal Engine Workspace Projection

This workspace folder is projection-only.

It must never become a second database.

The runtime bootstrap helper reads `.openclaw/workspace-state.json` and then uses the adapter session layer in:

- `agent-adapter/src/openclaw/bootstrap-session.ts`
- `agent-adapter/src/openclaw/dispatch-entrypoint.ts`

The files shown to OpenClaw should remain summary-only:

- current goal
- current guidance
- recovery summary

They must not store:

- full attempt history
- full reflection history
- policy version history

## Refresh Expectations

Projection refresh should happen:

1. after a goal starts
2. after a failed attempt writes updated guidance
3. when a new session recovers state

If projection is missing, rebuild it from service.

The rebuild should be triggered by:

- `recover current goal`
- session bootstrap when `.openclaw/workspace-state.json` says to rebuild on missing projection

It should not be triggered by `show goal status`.
