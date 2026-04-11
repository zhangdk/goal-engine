import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

type RootPackageJson = {
  name?: string;
  private?: boolean;
  type?: string;
  openclaw?: {
    extensions?: string[];
  };
};

type OpenClawPluginManifest = {
  id?: string;
  configSchema?: {
    type?: string;
    properties?: Record<string, unknown>;
  };
};

const repoRoot = resolve(import.meta.dirname, '..', '..');
const rootPackagePath = resolve(repoRoot, 'package.json');
const pluginManifestPath = resolve(repoRoot, 'openclaw.plugin.json');
const pluginEntryPath = resolve(repoRoot, 'index.ts');
const tempDirs: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();

  for (const dir of tempDirs.splice(0, tempDirs.length)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function createTempDir(prefix: string): string {
  const dir = mkdtempSync(resolve(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

describe('Goal Engine OpenClaw plugin shell', () => {
  it('exposes a root package with an OpenClaw extension entry', () => {
    expect(existsSync(rootPackagePath)).toBe(true);

    const pkg = JSON.parse(readFileSync(rootPackagePath, 'utf-8')) as RootPackageJson;
    expect(pkg.private).toBe(true);
    expect(pkg.type).toBe('module');
    expect(pkg.openclaw?.extensions).toEqual(['./index.ts']);
  });

  it('provides an OpenClaw plugin manifest and entry module', () => {
    expect(existsSync(pluginManifestPath)).toBe(true);
    expect(existsSync(pluginEntryPath)).toBe(true);

    const manifest = JSON.parse(readFileSync(pluginManifestPath, 'utf-8')) as OpenClawPluginManifest;
    expect(manifest.id).toBe('goal-engine');
    expect(manifest.configSchema?.type).toBe('object');
    expect(manifest.configSchema?.properties).toEqual(
      expect.objectContaining({
        serviceUrl: expect.any(Object),
        runtime: expect.any(Object),
      })
    );
  });

  it('registers explicit Goal Engine tools through the OpenClaw plugin entry', async () => {
    const mod = await import(pluginEntryPath);
    const plugin = mod.default as {
      id: string;
      name: string;
      register: (api: { registerTool: (...args: any[]) => void }) => void;
    };

    expect(plugin.id).toBe('goal-engine');
    expect(plugin.name).toBe('Goal Engine');

    const tools: Array<{ name: string; description: string }> = [];
    plugin.register({
      registerTool(tool) {
        tools.push({
          name: tool.name,
          description: tool.description,
        });
      },
    });

    expect(tools.map((tool) => tool.name)).toEqual([
      'goal_engine_bootstrap',
      'goal_engine_start_goal',
      'goal_engine_show_goal_status',
      'goal_engine_record_failed_attempt',
      'goal_engine_recover_current_goal',
      'goal_engine_check_retry',
    ]);
  });

  it('exposes replaceActiveGoal on the start-goal tool schema', async () => {
    const mod = await import(pluginEntryPath);
    const plugin = mod.default as {
      register: (api: {
        registerTool: (tool: {
          name: string;
          parameters: {
            properties?: Record<string, unknown>;
          };
        }) => void;
      }) => void;
    };

    const tools = new Map<string, { properties?: Record<string, unknown> }>();
    plugin.register({
      registerTool(tool) {
        tools.set(tool.name, tool.parameters);
      },
    });

    const startGoal = tools.get('goal_engine_start_goal');
    expect(startGoal?.properties).toEqual(
      expect.objectContaining({
        replaceActiveGoal: expect.any(Object),
      })
    );
  });

  it('exposes expectedGoalTitle on the show-goal-status tool schema', async () => {
    const mod = await import(pluginEntryPath);
    const plugin = mod.default;

    const tools = new Map();
    plugin.register({
      registerTool(tool: { name: string; parameters: { properties?: Record<string, unknown> } }) {
        tools.set(tool.name, tool.parameters);
      },
    });

    const showGoalStatus = tools.get('goal_engine_show_goal_status');
    expect(showGoalStatus?.properties).toEqual(
      expect.objectContaining({
        expectedGoalTitle: expect.any(Object),
      })
    );
  });

  it('accepts tool_unavailable as a record-failed-attempt failure type alias', async () => {
    const mod = await import(pluginEntryPath);
    const plugin = mod.default;

    const tools = new Map<string, { properties?: Record<string, any> }>();
    plugin.register({
      registerTool(tool: { name: string; parameters: { properties?: Record<string, any> } }) {
        tools.set(tool.name, tool.parameters);
      },
      on() {},
      config: {
        plugins: {
          entries: {
            'goal-engine': {
              config: {
                runtimeStatePath: resolve(createTempDir('goal-engine-record-alias-'), 'runtime-state.json'),
              },
            },
          },
        },
      },
    });

    const recordFailed = tools.get('goal_engine_record_failed_attempt');
    expect(recordFailed?.properties).toEqual(
      expect.objectContaining({
        failureType: expect.objectContaining({
          enum: expect.arrayContaining(['tool_unavailable', 'external_blocker']),
        }),
      })
    );
  });

  it('runs the adapter through the pnpm openclaw script instead of calling pnpm subcommands directly', async () => {
    const execFileMock = vi.fn((file, args, options, callback) => {
      callback(null, { stdout: '{"ok":true}\n', stderr: '' });
    });

    vi.doMock('node:child_process', () => ({
      execFile: execFileMock,
    }));

    const mod = await import(pluginEntryPath);
    const plugin = mod.default as {
      register: (api: {
        registerTool: (tool: {
          name: string;
          execute: (_toolCallId: string, params: Record<string, unknown>) => Promise<unknown>;
        }) => void;
      }) => void;
    };

    const tools = new Map<string, { execute: (_toolCallId: string, params: Record<string, unknown>) => Promise<unknown> }>();
    plugin.register({
      registerTool(tool) {
        tools.set(tool.name, tool);
      },
    });

    const bootstrap = tools.get('goal_engine_bootstrap');
    expect(bootstrap).toBeDefined();

    await bootstrap!.execute('call-1', {
      agentId: 'goal-engine-demo',
      agentName: 'goal-engine-demo',
      workspace: '/tmp/workspace',
      session: 'main',
    });

    expect(execFileMock).toHaveBeenCalledWith(
      'pnpm',
      expect.arrayContaining(['openclaw', 'bootstrap']),
      expect.objectContaining({
        env: expect.objectContaining({
          OPENCLAW_AGENT_ID: 'goal-engine-demo',
          OPENCLAW_AGENT_NAME: 'goal-engine-demo',
          OPENCLAW_WORKSPACE: '/tmp/workspace',
          OPENCLAW_SESSION: 'main',
        }),
      }),
      expect.any(Function)
    );
  });

  it('registers a before_tool_call guard that blocks external tools until goal status is confirmed', async () => {
    const mod = await import(pluginEntryPath);
    const plugin = mod.default as {
      register: (api: {
        registerTool: (...args: any[]) => void;
        on: (hookName: string, handler: (event: unknown) => unknown) => void;
        config: {
          plugins: {
            entries: {
              'goal-engine': {
                config: {
                  runtimeStatePath: string;
                };
              };
            };
          };
        };
      }) => void;
    };

    const stateDir = createTempDir('goal-engine-openclaw-hook-');
    const runtimeStatePath = resolve(stateDir, 'runtime-state.json');
    writeFileSync(runtimeStatePath, JSON.stringify({
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
        externalToolGuards: {
          'goal-engine-demo': {
            status: 'needs_status_check',
            reason: 'A goal was started or replaced. Confirm alignment with goal_engine_show_goal_status before any external tool use.',
            nextAction: 'Call goal_engine_show_goal_status with expectedGoalTitle before search, browsing, or external execution.',
            updatedAt: '2026-04-09T07:58:00.000Z',
          },
        },
      },
    }, null, 2), 'utf-8');

    let hookHandler: ((event: unknown) => unknown) | undefined;
    plugin.register({
      config: {
        plugins: {
          entries: {
            'goal-engine': {
              config: {
                runtimeStatePath,
              },
            },
          },
        },
      },
      registerTool() {},
      on(hookName, handler) {
        if (hookName === 'before_tool_call') {
          hookHandler = handler;
        }
      },
    });

    expect(hookHandler).toBeDefined();
    expect(hookHandler!({ toolName: 'web_search' })).toEqual({
      block: true,
      message: [
        'Goal Engine external-tool guard: A goal was started or replaced. Confirm alignment with goal_engine_show_goal_status before any external tool use.',
        'Next action: Call goal_engine_show_goal_status with expectedGoalTitle before search, browsing, or external execution.',
      ].join('\n'),
    });
    expect(hookHandler!({ toolName: 'goal_engine_show_goal_status' })).toBeUndefined();
  });

  it('records a guard runtime event even when hook events omit runtime identity', async () => {
    const mod = await import(pluginEntryPath);
    const plugin = mod.default as {
      register: (api: {
        registerTool: (...args: any[]) => void;
        on: (hookName: string, handler: (event: unknown) => unknown) => void;
        config: {
          plugins: {
            entries: {
              'goal-engine': {
                config: {
                  runtimeStatePath: string;
                };
              };
            };
          };
        };
      }) => void;
    };

    const stateDir = createTempDir('goal-engine-hook-runtime-event-');
    const runtimeStatePath = resolve(stateDir, 'runtime-state.json');
    writeFileSync(runtimeStatePath, JSON.stringify({
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
        externalToolGuards: {
          'goal-engine-demo': {
            status: 'needs_status_check',
            reason: 'A goal was started or replaced. Confirm alignment with goal_engine_show_goal_status before any external tool use.',
            nextAction: 'Call goal_engine_show_goal_status with expectedGoalTitle before search, browsing, or external execution.',
            updatedAt: '2026-04-09T07:58:00.000Z',
          },
        },
        runtimeEvents: {},
      },
    }, null, 2), 'utf-8');

    let hookHandler: ((event: unknown) => unknown) | undefined;
    plugin.register({
      config: {
        plugins: {
          entries: {
            'goal-engine': {
              config: {
                runtimeStatePath,
              },
            },
          },
        },
      },
      registerTool() {},
      on(hookName, handler) {
        if (hookName === 'before_tool_call') {
          hookHandler = handler;
        }
      },
    });

    expect(hookHandler).toBeDefined();
    hookHandler!({ toolName: 'web_search' });

    const runtimeState = JSON.parse(readFileSync(runtimeStatePath, 'utf-8')) as {
      goalEngine?: {
        runtimeEvents?: Record<string, Array<{ title: string; status: string; summary: string }>>;
      };
    };

    expect(runtimeState.goalEngine?.runtimeEvents?.['goal-engine-demo']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: '外部工具被阻止',
          status: 'warning',
          summary: '尝试调用 web_search，但 Goal Engine 尚未放行外部执行。',
        }),
      ])
    );
  });

  it('writes a runtime event after goal status is checked', async () => {
    const execFileMock = vi.fn((file, args, options, callback) => {
      callback(null, {
        stdout: JSON.stringify({
          summary: [
            'Goal status: 帮我在上海浦东张江找一个会议场地',
            'Goal alignment: blocked.',
            'Execution permission: denied until the active goal is aligned.',
            'Next action: Use goal_engine_start_goal before any search or browsing.',
          ].join('\n'),
        }),
        stderr: '',
      });
    });

    vi.doMock('node:child_process', () => ({
      execFile: execFileMock,
    }));

    const mod = await import(pluginEntryPath);
    const plugin = mod.default;
    const stateDir = createTempDir('goal-engine-runtime-events-');
    const runtimeStatePath = resolve(stateDir, 'runtime-state.json');

    const tools = new Map<string, { execute: (_toolCallId: string, params: Record<string, unknown>) => Promise<unknown> }>();
    plugin.register({
      config: {
        plugins: {
          entries: {
            'goal-engine': {
              config: {
                runtimeStatePath,
              },
            },
          },
        },
      },
      registerTool(tool: { name: string; execute: (_toolCallId: string, params: Record<string, unknown>) => Promise<unknown> }) {
        tools.set(tool.name, tool);
      },
    });

    await tools.get('goal_engine_show_goal_status')!.execute('call-1', {
      agentId: 'goal-engine-demo',
      agentName: 'goal-engine-demo',
      workspace: 'goal-engine',
      session: 'main',
      expectedGoalTitle: '帮我在上海浦东张江找一个会议场地',
    });

    const runtimeState = JSON.parse(readFileSync(runtimeStatePath, 'utf-8')) as {
      goalEngine?: {
        runtimeEvents?: Record<string, Array<{ title: string; status: string; summary: string }>>;
      };
    };

    expect(runtimeState.goalEngine?.runtimeEvents?.['goal-engine-demo']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: '对齐阻塞',
          status: 'blocked',
          summary: '当前任务“帮我在上海浦东张江找一个会议场地”尚未被 Goal Engine 接管。',
        }),
      ])
    );
  });

  it('blocks start_goal when it is used without a recent alignment gate', async () => {
    const execFileMock = vi.fn((file, args, options, callback) => {
      callback(null, {
        stdout: JSON.stringify({
          summary: 'Goal started: 新任务\nCurrent stage: goal-clarification\nSuccess criteria:\n- 拿到联系方式',
        }),
        stderr: '',
      });
    });

    vi.doMock('node:child_process', () => ({
      execFile: execFileMock,
    }));

    const mod = await import(pluginEntryPath);
    const plugin = mod.default;
    const stateDir = createTempDir('goal-engine-start-goal-warning-');
    const runtimeStatePath = resolve(stateDir, 'runtime-state.json');
    writeFileSync(runtimeStatePath, JSON.stringify({
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
    }, null, 2), 'utf-8');

    const tools = new Map<string, { execute: (_toolCallId: string, params: Record<string, unknown>) => Promise<unknown> }>();
    plugin.register({
      config: {
        plugins: {
          entries: {
            'goal-engine': {
              config: {
                runtimeStatePath,
              },
            },
          },
        },
      },
      registerTool(tool: { name: string; execute: (_toolCallId: string, params: Record<string, unknown>) => Promise<unknown> }) {
        tools.set(tool.name, tool);
      },
    });

    await expect(
      tools.get('goal_engine_start_goal')!.execute('call-1', {
        agentId: 'goal-engine-demo',
        agentName: 'goal-engine-demo',
        workspace: 'goal-engine',
        session: 'main',
        title: '新任务',
        successCriteria: ['拿到联系方式'],
        currentStage: 'goal-clarification',
      })
    ).rejects.toThrow('Goal Engine alignment gate missing');

    const runtimeState = JSON.parse(readFileSync(runtimeStatePath, 'utf-8')) as {
      goalEngine?: {
        runtimeEvents?: Record<string, Array<{ title: string; status: string; summary: string }>>;
      };
    };

    expect(runtimeState.goalEngine?.runtimeEvents?.['goal-engine-demo']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: '顺序违规',
          status: 'blocked',
          summary: '开始目标“新任务”前没有先执行 goal alignment gate。',
        }),
      ])
    );
    expect(runtimeState.goalEngine?.runtimeEvents?.['goal-engine-demo']).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: '开始目标',
          status: 'ok',
        }),
      ])
    );
  });

  it('falls back to the current managed agent when tool calls omit runtime parameters', async () => {
    const execFileMock = vi.fn((file, args, options, callback) => {
      callback(null, {
        stdout: JSON.stringify({
          summary: [
            'Goal status: 帮我在上海浦东张江找一个摄影棚',
            'Goal alignment: blocked.',
            'Execution permission: denied until the active goal is aligned.',
            'Next action: Use goal_engine_start_goal before any search or browsing.',
          ].join('\n'),
        }),
        stderr: '',
      });
    });

    vi.doMock('node:child_process', () => ({
      execFile: execFileMock,
    }));

    const mod = await import(pluginEntryPath);
    const plugin = mod.default;
    const stateDir = createTempDir('goal-engine-runtime-context-fallback-');
    const runtimeStatePath = resolve(stateDir, 'runtime-state.json');
    writeFileSync(runtimeStatePath, JSON.stringify({
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
    }, null, 2), 'utf-8');

    const tools = new Map<string, { execute: (_toolCallId: string, params: Record<string, unknown>) => Promise<unknown> }>();
    plugin.register({
      config: {
        plugins: {
          entries: {
            'goal-engine': {
              config: {
                runtimeStatePath,
              },
            },
          },
        },
      },
      registerTool(tool: { name: string; execute: (_toolCallId: string, params: Record<string, unknown>) => Promise<unknown> }) {
        tools.set(tool.name, tool);
      },
    });

    await tools.get('goal_engine_show_goal_status')!.execute('call-1', {
      expectedGoalTitle: '帮我在上海浦东张江找一个摄影棚',
    });

    expect(execFileMock).toHaveBeenCalledWith(
      'pnpm',
      expect.arrayContaining([
        '--agent-id',
        'goal-engine-demo',
        '--agent-name',
        'goal-engine-demo',
        '--workspace',
        'goal-engine',
        '--session',
        'main',
      ]),
      expect.any(Object),
      expect.any(Function)
    );

    const runtimeState = JSON.parse(readFileSync(runtimeStatePath, 'utf-8')) as {
      goalEngine?: {
        runtimeEvents?: Record<string, Array<{ title: string; status: string; summary: string }>>;
      };
    };

    expect(runtimeState.goalEngine?.runtimeEvents?.['goal-engine-demo']).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: '对齐阻塞',
          status: 'blocked',
          summary: '当前任务“帮我在上海浦东张江找一个摄影棚”尚未被 Goal Engine 接管。',
        }),
      ])
    );
  });
});
