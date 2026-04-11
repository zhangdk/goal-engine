# Goal Engine Service

This package is the Goal Engine v0 control layer and the only persisted fact source.

## Responsibilities

- persist `Goal`, `Attempt`, `Reflection`, and `Policy`
- update policy when a reflection is written
- enforce retry guard checks
- derive recovery packets
- expose the `/api/v1/*` HTTP contract

## Main Endpoints

- `POST /api/v1/goals`
- `GET /api/v1/goals/current`
- `PATCH /api/v1/goals/:goalId`
- `POST /api/v1/attempts`
- `GET /api/v1/attempts`
- `POST /api/v1/reflections`
- `GET /api/v1/policies/current`
- `POST /api/v1/retry-guard/check`
- `GET /api/v1/recovery-packet`
- `GET /api/v1/ui/observability`
- `GET /api/v1/health`
- `GET /ui`

## Local UI

`/ui` is a service-hosted observability page. It does not create a new source of truth.

It exists to show:

- original product intent
- current MVP intent
- current implementation status
- explicit covered / partial / missing gaps

Actions on the page call existing API routes directly. `Record Failure` is intentionally two-step:

1. `POST /api/v1/attempts`
2. `POST /api/v1/reflections`

## Verification

```bash
pnpm exec tsc --noEmit
pnpm test
pnpm test:e2e -- observability-ui.spec.ts
```

Implementation and test behavior must follow:

- `../docs/goal-engine-v0-implementation-baseline.md`
- `../docs/goal-engine-v0-test-strategy.md`
