# Agent Adapter

This package is the local-agent-facing wrapper around the Goal Engine service.

## Responsibilities

- provide an HTTP client for the local Goal Engine service
- map camelCase tool inputs to snake_case API payloads
- normalize service errors into stable adapter errors
- expose local helpers such as `reflectionGenerate`

## Current Tools

- `goalGetCurrent`
- `attemptAppend`
- `reflectionGenerate`
- `policyGetCurrent`
- `retryGuardCheck`
- `recoveryPacketGet`

## Current Workflows

- `startGoalSession`
- `showGoalStatus`
- `recordFailureAndRefresh`
- `recoverGoalSession`
- `checkRetryAndExplain`

## Verification

```bash
pnpm exec tsc --noEmit
pnpm test
```

Business rules stay in the service. The adapter should not re-implement policy or retry-guard logic.
The adapter does own user-facing workflow orchestration, including `showGoalStatus` and projection refresh handling.
