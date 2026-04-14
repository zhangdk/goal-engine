# Workspace Rules

> This file defines project-wide conventions that ALL AI agents (Claude Code, Gemini, Codex) and human contributors MUST follow.
> It is the single source of truth for cross-tool workspace discipline.

---

## 1. Temporary File Policy

**All temporary, ephemeral, or debugging artifacts MUST go to `.tmp/`.**

Never write temporary files to the project root, `service/`, `agent-adapter/`, `shared/`, or any source directory.

### What counts as temporary

| Category | Examples | Required path |
|---|---|---|
| Screenshots & browser captures | `*.png`, `*.jpg`, `*.webp` | `.tmp/screenshots/` |
| Validation snapshots | `*-snapshot.md`, `*-validation-*.md` | `.tmp/validation/` |
| E2E / test databases | `goal-engine-e2e-*.db*` | auto-cleaned by test runner, or `.tmp/test-db/` |
| Console logs & debug output | `*.log`, `console-*.txt` | `.tmp/logs/` |
| Ad-hoc markdown dumps | one-off investigation notes | `.tmp/notes/` |
| Browser MCP artifacts | `.playwright-mcp/`, `.gstack/` | already gitignored at project root |

### Rules

1. **Never create `*.png`, `*.log`, `*.db` (except the production `goal-engine.db`) in `service/` or project root.**
2. **`.tmp/` is gitignored.** Anything inside it is ephemeral and may be deleted at any time.
3. **If you need a screenshot or artifact to persist** (e.g., for documentation), move it to `docs/images/` and give it a descriptive name.
4. **E2E test databases** should be cleaned up by the test teardown. If a test framework writes to `service/`, configure its output to `.tmp/test-db/` or add cleanup to `afterAll`.
5. **Validation reports** intended for the project record go to `docs/` with a date prefix (e.g., `docs/goal-engine-validation-report-2026-04-10.md`). One-off validation snapshots go to `.tmp/validation/`.

### Quick reference

```bash
# Taking a screenshot during debugging
# WRONG:
#   screenshot saved to ./goal-engine-ui.png
# RIGHT:
mkdir -p .tmp/screenshots
#   screenshot saved to .tmp/screenshots/goal-engine-ui.png

# Dumping debug output
# WRONG:
#   echo "..." > debug-output.log
# RIGHT:
mkdir -p .tmp/logs
#   echo "..." > .tmp/logs/debug-output.log
```

---

## 2. File Organization

| Directory | Purpose | Ephemeral? |
|---|---|---|
| `service/src/` | Service source code | No |
| `agent-adapter/src/` | Adapter source code | No |
| `shared/` | Shared contracts | No |
| `openclaw/` | OpenClaw integration | No |
| `docs/` | Permanent documentation & images | No |
| `docs/images/` | Permanent screenshots for documentation | No |
| `examples/` | Example workspace projections | No |
| `.tmp/` | **All temporary artifacts** | **Yes** |
| `.learnings/` | Historical errors & lessons | No |
| `memory/` | Agent memory files | No |

---

## 3. Naming Conventions for Artifacts

- **Documentation images**: `docs/images/{feature}-{description}.png` (e.g., `docs/images/agent-detail-evolution-timeline.png`)
- **Validation reports**: `docs/goal-engine-validation-report-{YYYY-MM-DD}.md`
- **Temporary screenshots**: `.tmp/screenshots/{context}-{timestamp}.png`
- **Temporary logs**: `.tmp/logs/{source}-{timestamp}.log`

---

## 4. Enforcement

This file is referenced by CLAUDE.md, GEMINI.md, and AGENTS.md. All AI coding agents operating in this workspace are expected to:

1. Read this file at session start (or when referenced)
2. Follow the `.tmp/` policy for any file creation that is not source code or permanent documentation
3. Clean up `.tmp/` contents when they are no longer needed
4. Never commit files from `.tmp/` to git
