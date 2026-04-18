import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseOpenClawCliArgs } from '../src/openclaw/cli.js';

type CommandsConfig = {
  bootstrap: {
    command: string[];
    cwd: string;
    produces: string;
    summary?: string;
  };
  entrypoints: Record<string, {
    command: string[];
    cwd: string;
    produces: string;
    summary?: string;
  }>;
};

const repoRoot = resolve(import.meta.dirname, '..', '..');
const commandsPath = resolve(repoRoot, 'openclaw', 'commands.json');

describe('openclaw/commands.json', () => {
  it('uses the agent-adapter CLI script for bootstrap and entrypoints', () => {
    const commands = readCommands();

    expect(commands.bootstrap.cwd).toBe('agent-adapter');
    expect(commands.bootstrap.command.slice(0, 2)).toEqual(['pnpm', 'openclaw']);
    expect(commands.bootstrap.command).toEqual(expect.arrayContaining([
      '--agent-id',
      '<agent-id>',
      '--agent-name',
      '<agent-name>',
      '--workspace',
      '<workspace>',
      '--session',
      '<session>',
    ]));

    for (const entrypoint of Object.values(commands.entrypoints)) {
      expect(entrypoint.cwd).toBe('agent-adapter');
      expect(entrypoint.command.slice(0, 2)).toEqual(['pnpm', 'openclaw']);
      expect(entrypoint.produces).toBe('json');
      expect(entrypoint.command).toEqual(expect.arrayContaining([
        '--agent-id',
        '<agent-id>',
        '--agent-name',
        '<agent-name>',
        '--workspace',
        '<workspace>',
        '--session',
        '<session>',
      ]));
    }

    expect(commands.entrypoints['show goal status'].summary).toContain('multi-search-engine');
    expect(commands.entrypoints['supervise external goal'].summary).toContain('GoalContract');
    expect(commands.entrypoints['record evidence'].summary).toContain('Record proof');
    expect(commands.entrypoints['complete goal'].summary).toContain('evidence ids');
  });

  it('contains only entrypoints accepted by the CLI parser', () => {
    const commands = readCommands();

    for (const [name, config] of Object.entries(commands.entrypoints)) {
      const args = config.command.slice(2);
      const parsed = parseOpenClawCliArgs(args);

      expect(parsed.kind).toBe('entrypoint');
      if (parsed.kind !== 'entrypoint') {
        throw new Error(`Expected entrypoint command for ${name}`);
      }
      expect(parsed.request.entrypoint).toBe(name);
    }
  });
});

function readCommands(): CommandsConfig {
  return JSON.parse(readFileSync(commandsPath, 'utf-8')) as CommandsConfig;
}
