# Goal Engine v0 Data Model

## Schema Evolution Rules

- Add optional columns/tables before requiring clients to write them.
- Use new tables for new fact types when that preserves old route behavior.
- Preserve old rows during migration.
- New fact tables should include `agent_id` when goal-scoped data is agent-scoped.
- Every new persisted shape requires a migration/schema test.

## goal_contracts

One current contract per `(agent_id, goal_id)`.

Stores service-owned completion intent:

- `outcome`
- `success_evidence`
- optional `deadline_at`
- `autonomy_level`
- `boundary_rules`
- `stop_conditions`
- `strategy_guidance`
- `permission_boundary`

The table is goal-scoped and cascades when the goal is deleted.

## attempt_evidence

First-class evidence records linked to a goal and optionally an attempt.

Evidence is scoped by `agent_id` and `goal_id`. When `attempt_id` is present, the composite foreign key requires the attempt to belong to the same `(agent_id, goal_id)`.

Supported `kind` values:

- `artifact`
- `external_fact`
- `channel_check`
- `permission_boundary`
- `reply`
- `payment`
- `blocker`

Supported `verifier` values:

- `agent`
- `user`
- `service`
- `browser`

`confidence` is constrained from `0` through `1`.

## goal_completions

Evidence-referenced completion record for a goal.

One completion is allowed per `(agent_id, goal_id)`. `evidence_ids` stores the evidence references used at completion time, and the service route validates those ids before writing this row.
