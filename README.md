# Goal Engine

Goal Engine is an isolated subproject for validating persistent goal control for local OpenClaw agents.

## Purpose

This project tests whether a local agent can:

- keep a long-running goal active across sessions
- continue after failure instead of drifting away
- record structured attempts and reflections
- reduce repeated mistakes over time

## Scope Status

This project is in active v0 implementation.

The current build already includes:

- a local `service` with SQLite-backed goal, attempt, reflection, policy, retry-guard, and recovery endpoints
- a local Agent Gallery UI at `service /ui`, backed by `GET /api/v1/ui/agents` and `GET /api/v1/ui/agents/:agentId`
- an `agent-adapter` with client, tool wrappers, projection orchestration, and user workflow helpers, including `showGoalStatus`
- a shared contract layer in `shared/types.ts`
- projection helpers under `examples/workspace/goal-engine/`
- OpenClaw-facing entrypoint definitions under `openclaw/`
- OpenClaw-oriented E2E coverage for the explicit user flow

Still deferred:

- automatic OpenClaw lifecycle execution beyond the explicit plugin shell
- multi-agent support
- broader packaging beyond the isolated subproject

## Structure

```text
goal-engine/
  README.md
  docs/
  agent-adapter/
  service/
  shared/
  examples/
```

## Key Docs

- `docs/goal-engine-v0-implementation-baseline.md`
- `docs/goal-engine-v0-test-strategy.md`
- `docs/superpowers/plans/2026-04-03-goal-engine-v0.md`
- `docs/superpowers/plans/2026-04-04-goal-engine-openclaw-user-experience.md`
- `docs/superpowers/specs/2026-04-04-goal-engine-openclaw-user-experience-design.md`
- `docs/goal-engine-openclaw-quickstart.md`
- `docs/goal-engine-openclaw-user-guide.md`

Background architecture and contracts live in:

- `docs/goal-engine-v0-architecture.md`
- `docs/goal-engine-v0-data-model.md`
- `docs/goal-engine-v0-api-contract.md`
- `docs/goal-engine-v0-openclaw-integration.md`
- `docs/goal-engine-v0-behavior-change-loop.md`

## Verification

```bash
cd service && pnpm exec tsc --noEmit && pnpm test
cd ../agent-adapter && pnpm exec tsc --noEmit && pnpm test
cd ../service && pnpm test:e2e
```

## Local Agent UI

Start the service:

```bash
cd service
pnpm install
pnpm dev
```

Then open:

- `http://127.0.0.1:3100/ui`
- `http://127.0.0.1:3100/api/v1/ui/agents`
- `http://127.0.0.1:3100/api/v1/ui/agents/:agentId`

This UI is intentionally a local evaluation surface, not a polished OpenClaw frontend. It now focuses on the user question “what happened to this agent?” rather than raw requirement mapping. It shows:

- an `Agent Gallery` homepage for observable agents
- an `Agent Detail` page with `Learning Verdict`, `Current State`, `Evolution Timeline`, and `System Gaps`
- real implementation state derived from the service fact source
- explicit product honesty about what is still missing

It still intentionally exposes current product gaps:

- automatic `goal_engine_bootstrap` lifecycle execution is not wired yet
- retry/failure lifecycle automation is not safely automatable with the current hook semantics
- OpenClaw runtime/plugin/hook lifecycle wiring is still unfinished beyond the plugin shell
- normal-user OpenClaw experience is still not implemented

## Project Status

Core v0 service and adapter behavior are implemented and covered by tests.

The repository now also includes the first pass of an OpenClaw user-experience layer:

- explicit user-facing Goal Engine entrypoints
- adapter workflows for start / status / failure write-back / retry check / recovery
- projection refresh and local projection state loading
- an acceptance checklist for OpenClaw power users
- a service-hosted Agent Gallery / Detail UI for learning-history inspection

This means the project has moved beyond “API-only prototype”, but it is still not a general-user product.

Current honest status:

- OpenClaw power users can start evaluating the experience shape
- local evaluators can inspect an agent's current state and learning history at `/ui`
- the repo now exposes a local OpenClaw plugin shell and explicit Goal Engine tools
- local smoke validation has confirmed `openclaw plugins install -l ...`, `openclaw plugins list`, and `openclaw plugins inspect goal-engine`
- OpenClaw has plugin hook capability, but the current hook payloads are not semantic enough to safely automate Goal Engine retry/failure write-back
- normal users still cannot use this directly
- the biggest remaining gap is automatic runtime/hook lifecycle wiring on top of the plugin shell
