import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatCliError, parseOpenClawCliArgs, runOpenClawCli } from '../src/openclaw/cli.js';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

describe('parseOpenClawCliArgs', () => {
  it('parses bootstrap arguments', () => {
    const parsed = parseOpenClawCliArgs([
      'bootstrap',
      '--workspace-state',
      '/tmp/workspace-state.json',
      '--runtime-state',
      '/tmp/runtime-state.json',
      '--agent-id',
      'goal-engine-demo',
      '--agent-name',
      'goal-engine-demo',
      '--workspace',
      'goal-engine',
      '--session',
      'main',
      '--service-url',
      'http://localhost:3200',
    ]);

    expect(parsed).toEqual({
      kind: 'bootstrap',
      serviceUrl: 'http://localhost:3200',
      workspaceStatePath: '/tmp/workspace-state.json',
      runtimeStatePath: '/tmp/runtime-state.json',
      runtimeContext: {
        agentId: 'goal-engine-demo',
        agentName: 'goal-engine-demo',
        workspace: 'goal-engine',
        session: 'main',
      },
    });
  });

  it('parses an entrypoint request with JSON payload', () => {
    const parsed = parseOpenClawCliArgs([
      'entrypoint',
      'start goal',
      '--payload',
      '{"title":"Ship Goal Engine","successCriteria":["One flow works"],"replaceActiveGoal":true}',
    ]);

    expect(parsed).toEqual({
      kind: 'entrypoint',
      serviceUrl: 'http://localhost:3100',
      request: {
        entrypoint: 'start goal',
        input: {
          title: 'Ship Goal Engine',
          successCriteria: ['One flow works'],
          replaceActiveGoal: true,
        },
      },
    });
  });

  it('falls back to OpenClaw environment variables for runtime context', () => {
    const previousEnv = {
      OPENCLAW_AGENT_ID: process.env['OPENCLAW_AGENT_ID'],
      OPENCLAW_AGENT_NAME: process.env['OPENCLAW_AGENT_NAME'],
      OPENCLAW_WORKSPACE: process.env['OPENCLAW_WORKSPACE'],
      OPENCLAW_SESSION: process.env['OPENCLAW_SESSION'],
    };

    process.env['OPENCLAW_AGENT_ID'] = 'goal-engine-demo';
    process.env['OPENCLAW_AGENT_NAME'] = 'goal-engine-demo';
    process.env['OPENCLAW_WORKSPACE'] = 'goal-engine';
    process.env['OPENCLAW_SESSION'] = 'main';

    try {
      const parsed = parseOpenClawCliArgs(['bootstrap']);

      expect(parsed).toEqual({
        kind: 'bootstrap',
        serviceUrl: 'http://localhost:3100',
        runtimeContext: {
          agentId: 'goal-engine-demo',
          agentName: 'goal-engine-demo',
          workspace: 'goal-engine',
          session: 'main',
        },
      });
    } finally {
      restoreEnv(previousEnv);
    }
  });
});

describe('runOpenClawCli', () => {
  it('runs bootstrap and writes runtime-state from explicit runtime context', async () => {
    const output: string[] = [];
    const createClient = vi.fn(() => ({}) as never);
    const stateDir = createTempDir('goal-engine-openclaw-cli-');
    const workspaceStatePath = join(stateDir, 'workspace-state.json');
    const runtimeStatePath = join(stateDir, 'runtime-state.json');
    writeFileSync(workspaceStatePath, JSON.stringify({
      version: 1,
      goalEngine: {
        currentManagedAgentId: 'goal-engine-demo',
        managedAgents: [
          {
            agentId: 'goal-engine-demo',
            agentName: 'goal-engine-demo',
            workspace: 'goal-engine',
            session: 'main',
            managed: true,
          },
        ],
      },
    }, null, 2), 'utf-8');

    await runOpenClawCli([
      'bootstrap',
      '--workspace-state',
      workspaceStatePath,
      '--runtime-state',
      runtimeStatePath,
      '--agent-id',
      'goal-engine-demo',
      '--agent-name',
      'goal-engine-demo',
      '--workspace',
      'goal-engine',
      '--session',
      'main',
    ], {
      createClient,
      bootstrapSession: vi.fn().mockResolvedValue({
        action: 'show goal status',
        summary: 'Bootstrapped from projection',
      }),
      dispatchEntrypoint: vi.fn(),
      writeStdout: text => {
        output.push(text);
      },
    });

    expect(output.join('')).toContain('"action": "show goal status"');
    expect(output.join('')).toContain('Bootstrapped from projection');
    expect(createClient).toHaveBeenCalledWith('http://localhost:3100', 'goal-engine-demo');
    expect(existsSync(runtimeStatePath)).toBe(true);
    expect(JSON.parse(readFileSync(runtimeStatePath, 'utf-8'))).toEqual({
      goalEngine: {
        currentManagedAgentId: 'goal-engine-demo',
        managedAgents: [
          {
            agentId: 'goal-engine-demo',
            agentName: 'goal-engine-demo',
            workspace: 'goal-engine',
            session: 'main',
            managed: true,
          },
        ],
        goalAlignmentSnapshots: {},
        externalToolGuards: {},
        runtimeEvents: {},
      },
    });
  });

  it('preserves the managed agent registry from workspace-state while switching the current runtime agent', async () => {
    const stateDir = createTempDir('goal-engine-openclaw-cli-');
    const workspaceStatePath = join(stateDir, 'workspace-state.json');
    const runtimeStatePath = join(stateDir, 'runtime-state.json');
    writeFileSync(workspaceStatePath, JSON.stringify({
      version: 1,
      goalEngine: {
        currentManagedAgentId: 'goal-engine-demo',
        managedAgents: [
          {
            agentId: 'goal-engine-demo',
            agentName: 'goal-engine-demo',
            workspace: 'goal-engine',
            session: 'main',
            managed: true,
          },
          {
            agentId: 'goal-engine-research',
            agentName: 'goal-engine-research',
            workspace: 'goal-engine',
            session: 'research',
            managed: true,
          },
        ],
      },
    }, null, 2), 'utf-8');

    await runOpenClawCli([
      'bootstrap',
      '--workspace-state',
      workspaceStatePath,
      '--runtime-state',
      runtimeStatePath,
      '--agent-id',
      'goal-engine-research',
      '--agent-name',
      'goal-engine-research',
      '--workspace',
      'goal-engine',
      '--session',
      'research',
    ], {
      createClient: () => ({}) as never,
      bootstrapSession: vi.fn().mockResolvedValue({
        action: 'show goal status',
        summary: 'Bootstrapped from projection',
      }),
      dispatchEntrypoint: vi.fn(),
      writeStdout: vi.fn(),
    });

    expect(JSON.parse(readFileSync(runtimeStatePath, 'utf-8'))).toEqual({
      goalEngine: {
        currentManagedAgentId: 'goal-engine-research',
        managedAgents: [
          {
            agentId: 'goal-engine-demo',
            agentName: 'goal-engine-demo',
            workspace: 'goal-engine',
            session: 'main',
            managed: true,
          },
          {
            agentId: 'goal-engine-research',
            agentName: 'goal-engine-research',
            workspace: 'goal-engine',
            session: 'research',
            managed: true,
          },
        ],
        goalAlignmentSnapshots: {},
        externalToolGuards: {},
        runtimeEvents: {},
      },
    });
  });

  it('does not write runtime-state when real runtime context is missing', async () => {
    const output: string[] = [];
    const stateDir = createTempDir('goal-engine-openclaw-cli-');
    const workspaceStatePath = join(stateDir, 'workspace-state.json');
    const runtimeStatePath = join(stateDir, 'runtime-state.json');
    writeFileSync(workspaceStatePath, JSON.stringify({
      version: 1,
      goalEngine: {
        currentManagedAgentId: 'goal-engine-demo',
        managedAgents: [
          {
            agentId: 'goal-engine-demo',
            agentName: 'goal-engine-demo',
            workspace: 'goal-engine',
            session: 'main',
            managed: true,
          },
        ],
      },
    }, null, 2), 'utf-8');

    await runOpenClawCli([
      'bootstrap',
      '--workspace-state',
      workspaceStatePath,
      '--runtime-state',
      runtimeStatePath,
    ], {
      createClient: () => ({}) as never,
      bootstrapSession: vi.fn().mockResolvedValue({
        action: 'show goal status',
        summary: 'Bootstrapped from projection',
      }),
      dispatchEntrypoint: vi.fn(),
      writeStdout: text => {
        output.push(text);
      },
    });

    expect(output.join('')).toContain('"action": "show goal status"');
    expect(existsSync(runtimeStatePath)).toBe(false);
  });

  it('runs an entrypoint request and writes JSON output', async () => {
    const output: string[] = [];

    await runOpenClawCli([
      'entrypoint',
      'check retry',
      '--payload',
      '{"plannedAction":"Try again","whatChanged":"Changed the search path","strategyTags":["official-docs"],"policyAcknowledged":true}',
    ], {
      createClient: () => ({}) as never,
      bootstrapSession: vi.fn(),
      dispatchEntrypoint: vi.fn().mockResolvedValue({
        entrypoint: 'check retry',
        summary: 'Retry check: allowed.',
        rawReason: 'allowed',
      }),
      writeStdout: text => {
        output.push(text);
      },
    });

    expect(output.join('')).toContain('"entrypoint": "check retry"');
    expect(output.join('')).toContain('Retry check: allowed.');
  });

  it('uses the current runtime-state agent id when runtime args are omitted', async () => {
    const stateDir = createTempDir('goal-engine-openclaw-cli-');
    const runtimeStatePath = join(stateDir, 'runtime-state.json');
    writeFileSync(runtimeStatePath, JSON.stringify({
      goalEngine: {
        currentManagedAgentId: 'goal-engine-research',
        managedAgents: [
          {
            agentId: 'goal-engine-research',
            agentName: 'goal-engine-research',
            workspace: 'goal-engine',
            session: 'research',
            managed: true,
          },
        ],
        goalAlignmentSnapshots: {},
        externalToolGuards: {},
        runtimeEvents: {},
      },
    }), 'utf-8');
    const createClient = vi.fn(() => ({}) as never);

    await runOpenClawCli([
      'entrypoint',
      'check retry',
      '--runtime-state',
      runtimeStatePath,
      '--payload',
      '{"plannedAction":"Try again","whatChanged":"Changed","strategyTags":["official-docs"],"policyAcknowledged":true}',
    ], {
      createClient,
      bootstrapSession: vi.fn(),
      dispatchEntrypoint: vi.fn().mockResolvedValue({
        entrypoint: 'check retry',
        summary: 'Retry check: allowed.',
      }),
      writeStdout: vi.fn(),
    });

    expect(createClient).toHaveBeenCalledWith('http://localhost:3100', 'goal-engine-research');
  });
});

function restoreEnv(values: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }
}

describe('formatCliError', () => {
  it('returns the message from adapter-style error objects', () => {
    expect(formatCliError({
      code: 'state_conflict',
      status: 409,
      message: 'An active goal already exists',
    })).toBe('An active goal already exists');
  });

  it('falls back to JSON for unknown objects', () => {
    expect(formatCliError({ code: 'unknown_error' })).toBe('{"code":"unknown_error"}');
  });
});
