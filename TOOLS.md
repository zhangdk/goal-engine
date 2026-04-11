# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for _your_ specifics — the stuff that's unique to your setup.

## What Goes Here

Things like:

- Camera names and locations
- SSH hosts and aliases
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

## Examples

```markdown
### Cameras

- living-room → Main area, 180° wide angle
- front-door → Entrance, motion-triggered

### SSH

- home-server → 192.168.1.100, user: admin

### TTS

- Preferred voice: "Nova" (warm, slightly British)
- Default speaker: Kitchen HomePod
```

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

---

Add whatever helps you do your job. This is your cheat sheet.

## Goal Engine / OpenClaw Gotchas

- When invoking `pnpm --dir agent-adapter openclaw ...`, pass `--runtime-state` and `--workspace-state` as absolute paths. Relative paths resolve under `agent-adapter/` and can silently write to `agent-adapter/.openclaw/` instead of the workspace root `.openclaw/`.
- Service UI tests that read OpenClaw runtime state must use a temporary isolated `runtime-state.json`. Do not let tests read the real workspace `.openclaw/runtime-state.json`, or local browser sessions will pollute assertions.
- When an aligned external task needs search and native `web_search` is unavailable, prefer the ready local `multi-search-engine` skill before declaring search unavailable.
