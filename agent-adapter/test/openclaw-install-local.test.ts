import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '..', '..');
const installScriptPath = resolve(repoRoot, 'scripts', 'install-local.sh');

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe('Goal Engine local OpenClaw installer', () => {
  it('enables Goal Engine plugin wiring and bootstrap hooks in local OpenClaw config', () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'goal-engine-openclaw-install-'));
    tempDirs.push(tempRoot);

    const homeDir = join(tempRoot, 'home');
    const binDir = join(tempRoot, 'bin');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(binDir, { recursive: true });

    const fakeOpenclawPath = join(binDir, 'openclaw');
    writeFileSync(
      fakeOpenclawPath,
      `#!/usr/bin/env bash
set -euo pipefail
mkdir -p "$HOME/.openclaw"
if [ ! -f "$HOME/.openclaw/openclaw.json" ]; then
  printf '%s\n' '{"plugins":{"entries":{}},"hooks":{"internal":{"entries":{}}}}' > "$HOME/.openclaw/openclaw.json"
fi
exit 0
`,
      'utf-8'
    );
    execFileSync('chmod', ['+x', fakeOpenclawPath]);

    execFileSync('bash', [installScriptPath], {
      cwd: repoRoot,
      env: {
        ...process.env,
        HOME: homeDir,
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
      },
      stdio: 'pipe',
    });

    const configPath = join(homeDir, '.openclaw', 'openclaw.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8')) as {
      plugins?: {
        entries?: Record<string, { enabled?: boolean; config?: Record<string, unknown> }>;
      };
      hooks?: {
        internal?: {
          enabled?: boolean;
          entries?: Record<string, { enabled?: boolean; paths?: string[] }>;
        };
      };
    };

    expect(config.plugins?.entries?.['goal-engine']?.enabled).toBe(true);
    expect(config.hooks?.internal?.enabled).toBe(true);
    expect(config.hooks?.internal?.entries?.['bootstrap-extra-files']?.enabled).toBe(true);
    expect(config.hooks?.internal?.entries?.['boot-md']?.enabled).toBe(true);
    expect(config.hooks?.internal?.entries?.['bootstrap-extra-files']?.paths).toEqual(
      expect.arrayContaining([
        'AGENTS.md',
        'SOUL.md',
        'USER.md',
        'BOOT.md',
        'openclaw/workspace/goal-engine/AGENTS.md',
        'openclaw/workspace/goal-engine/SKILLS.md',
      ])
    );
  });
});
