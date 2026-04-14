#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OPENCLAW_CONFIG="${HOME}/.openclaw/openclaw.json"

echo "Installing Goal Engine plugin from local path..."
openclaw plugins install -l "$ROOT_DIR"

python - <<'PY'
import json
from pathlib import Path

config_path = Path.home() / ".openclaw" / "openclaw.json"
data = json.loads(config_path.read_text())

plugins = data.setdefault("plugins", {})
entries = plugins.setdefault("entries", {})
entry = entries.setdefault("goal-engine", {})
entry["enabled"] = True
config = entry.setdefault("config", {})
config.setdefault("serviceUrl", "http://localhost:3100")
runtime = config.setdefault("runtime", {})
runtime.setdefault("preferEnvContext", True)

hooks = data.setdefault("hooks", {})
internal = hooks.setdefault("internal", {})
internal["enabled"] = True
hook_entries = internal.setdefault("entries", {})
boot_md = hook_entries.setdefault("boot-md", {})
boot_md["enabled"] = True
bootstrap_extra = hook_entries.setdefault("bootstrap-extra-files", {})
bootstrap_extra["enabled"] = True
paths = bootstrap_extra.setdefault("paths", [])
for required in [".context/AGENTS.md", ".context/SOUL.md", ".context/USER.md", ".context/BOOT.md", "openclaw/workspace/goal-engine/AGENTS.md", "openclaw/workspace/goal-engine/SKILLS.md"]:
    if required not in paths:
        paths.append(required)

config_path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
PY

echo
echo "Goal Engine local install complete."
echo "Plugin source: $ROOT_DIR"
echo "OpenClaw config: $OPENCLAW_CONFIG"
echo "Enabled hook: boot-md"
echo "Enabled hook: bootstrap-extra-files"
