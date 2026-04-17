# Goal Engine v0 Data Model

## Schema Evolution Rules

- Add optional columns/tables before requiring clients to write them.
- Use new tables for new fact types when that preserves old route behavior.
- Preserve old rows during migration.
- New fact tables should include `agent_id` when goal-scoped data is agent-scoped.
- Every new persisted shape requires a migration/schema test.
