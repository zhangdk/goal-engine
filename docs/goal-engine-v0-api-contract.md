# Goal Engine v0 API Contract

## Compatibility Rules

- New request fields must be optional until all adapter clients support them.
- New response fields must be additive.
- Existing enum values must not be removed without a migration window.
- Service routes should tolerate older adapter payloads where possible.
- Adapter parsers should ignore unknown service response fields.
- For this platform facts foundation slice, `POST /goals/:goalId/complete` is the planned evidence-referenced completion protocol; direct status patching remains legacy-compatible but is not the recommended completion path once that route is available.

## Goal Contract

`POST /api/v1/goals` accepts optional `contract`.

Request example:

```json
{
  "title": "Goal with contract",
  "success_criteria": ["Payment confirmation exists"],
  "stop_conditions": ["No deception"],
  "current_stage": "goal-contract",
  "contract": {
    "outcome": "Earn 100 RMB",
    "success_evidence": ["Payment confirmation exists"],
    "deadline_at": "2026-04-18T00:00:00.000Z",
    "autonomy_level": 2,
    "boundary_rules": ["Ask before payment"],
    "stop_conditions": ["No deception"],
    "strategy_guidance": ["Prefer fast validation"],
    "permission_boundary": ["No payment without approval"]
  }
}
```

Response includes `data.contract` when one is created.

`GET /api/v1/goals/:goalId/contract` returns the persisted contract or `404`.

## Evidence

`POST /api/v1/evidence` records first-class evidence for a goal and optional attempt.

Request example:

```json
{
  "goal_id": "goal_1",
  "attempt_id": "attempt_1",
  "kind": "artifact",
  "summary": "Created landing page draft",
  "file_path": "artifacts/landing.md",
  "observed_at": "2026-04-17T00:00:00.000Z",
  "verifier": "agent",
  "confidence": 0.8
}
```

`GET /api/v1/evidence?goal_id=...` lists evidence for a goal. `attempt_id` can narrow the list.

Valid `kind` values: `artifact`, `external_fact`, `channel_check`, `permission_boundary`, `reply`, `payment`, `blocker`.

Valid `verifier` values: `agent`, `user`, `service`, `browser`.

## Evidence-Referenced Completion

`POST /api/v1/goals/:goalId/complete` is the preferred completion path.

Request example:

```json
{
  "evidence_ids": ["evidence_1"],
  "summary": "Completed with artifact evidence"
}
```

It requires non-empty `evidence_ids`; every evidence id must belong to the requesting agent and goal.

This route validates evidence ownership and basic admissibility. It does not yet perform a semantic verdict against every `GoalContract.successEvidence` item.

Duplicate completion returns `409 state_conflict`. `blocker` evidence returns `422 inadmissible_evidence`.
