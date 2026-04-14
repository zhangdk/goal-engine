import { execFile } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  appendGoalEngineRuntimeEvent,
  readCurrentManagedAgent,
  readGoalEngineRuntimeEvents,
  readExternalToolGuard,
  type GoalEngineRuntimeEvent,
} from './agent-adapter/src/openclaw/runtime-state.js';
import { FAILURE_TYPES } from './shared/runtime.js';

const execFileAsync = promisify(execFile);
const repoRoot = dirname(fileURLToPath(import.meta.url));
const defaultAdapterDir = resolve(repoRoot, 'agent-adapter');

type OpenClawPluginApi = {
  config?: {
    plugins?: {
      entries?: Record<string, { config?: GoalEnginePluginConfig }>;
    };
  };
  logger?: {
    info?: (message: string) => void;
    debug?: (message: string) => void;
    warn?: (message: string) => void;
  };
  on?: (
    hookName: string,
    handler: (event: unknown) => Promise<unknown> | unknown,
    opts?: { name?: string; priority?: number }
  ) => void;
  registerHook?: (
    events: string | string[],
    handler: (event: unknown) => Promise<unknown> | unknown,
    opts?: { name?: string; priority?: number }
  ) => void;
  registerTool: (
    tool: {
      name: string;
      label: string;
      description: string;
      parameters: Record<string, unknown>;
      execute: (_toolCallId: string, params: Record<string, unknown>) => Promise<unknown>;
    },
    meta?: { name?: string }
  ) => void;
};

type GoalEnginePluginConfig = {
  serviceUrl?: string;
  adapterDir?: string;
  workspaceStatePath?: string;
  runtimeStatePath?: string;
  runtime?: {
    preferEnvContext?: boolean;
  };
};

type RuntimeContext = {
  agentId?: string;
  agentName?: string;
  workspace?: string;
  session?: string;
};

type ToolDefinition = {
  name: string;
  label: string;
  description: string;
  parameters: Record<string, unknown>;
  runtimeEventKind: GoalEngineRuntimeEvent['kind'];
  execute: (api: OpenClawPluginApi, params: Record<string, unknown>) => Promise<unknown>;
};

const ALIGNMENT_GATE_WINDOW_MS = 2 * 60 * 1000;
const FAILURE_TYPE_INPUTS = [...FAILURE_TYPES, 'tool_unavailable'] as const;

const plugin = {
  id: 'goal-engine',
  name: 'Goal Engine',
  description: 'Goal Engine OpenClaw bridge for bootstrap, goal control, retry checks, and recovery',
  register(api: OpenClawPluginApi) {
    registerExternalToolGuards(api);

    for (const tool of buildTools()) {
      api.registerTool(
        {
          name: tool.name,
          label: tool.label,
          description: tool.description,
          parameters: tool.parameters,
          async execute(_toolCallId, params) {
            const runtimeContext = resolveRuntimeContext(params, resolveConfig(api));
            const startedAt = new Date().toISOString();

            if (tool.runtimeEventKind === 'start_goal') {
              ensureRecentAlignmentGateForStartGoal(api, runtimeContext, params, startedAt);
            }

            try {
              const result = await tool.execute(api, params);
              recordRuntimeEvent(api, runtimeContext, buildRuntimeEvent({
                kind: tool.runtimeEventKind,
                params,
                result,
                startedAt,
              }));
              return result;
            } catch (error: unknown) {
              recordRuntimeEvent(api, runtimeContext, buildRuntimeEvent({
                kind: tool.runtimeEventKind,
                params,
                error,
                startedAt,
              }));
              throw error;
            }
          },
        },
        { name: tool.name }
      );
    }

    api.logger?.info?.('goal-engine: registered OpenClaw plugin tools');
  },
};

export default plugin;

const EXTERNAL_TOOL_NAMES = new Set([
  'web_search',
  'web_fetch',
  'web_search_exa',
  'web_fetch_exa',
  'message',
  'feishu_chat',
  'p30_send_message',
  'browser',
  'browser_navigate',
  'browser_click',
  'browser_fill_form',
  'browser_type',
  'browser_run_code',
]);

function buildTools(): ToolDefinition[] {
  return [
    {
      name: 'goal_engine_bootstrap',
      label: 'Goal Engine Bootstrap',
      description: 'Bootstrap Goal Engine for the current OpenClaw session and refresh runtime-state',
      parameters: runtimeParameters(),
      runtimeEventKind: 'bootstrap',
      execute: async (api, params) =>
        runGoalEngineCli(api, {
          command: 'bootstrap',
          params,
        }),
    },
    {
      name: 'goal_engine_start_goal',
      label: 'Goal Engine Start Goal',
      description: 'Start a new Goal Engine goal from inside OpenClaw',
      runtimeEventKind: 'start_goal',
      parameters: {
        type: 'object',
        required: ['title', 'successCriteria'],
        properties: {
          ...runtimeParameterProperties(),
          title: { type: 'string' },
          successCriteria: { type: 'array', items: { type: 'string' } },
          currentStage: { type: 'string' },
          stopConditions: { type: 'array', items: { type: 'string' } },
          priority: { type: 'number' },
          replaceActiveGoal: { type: 'boolean' },
        },
      },
      execute: async (api, params) =>
        runGoalEngineCli(api, {
          command: 'entrypoint',
          entrypoint: 'start goal',
          params,
          payloadKeys: ['title', 'successCriteria', 'currentStage', 'stopConditions', 'priority', 'replaceActiveGoal'],
        }),
    },
    {
      name: 'goal_engine_supervise_external_goal',
      label: 'Goal Engine Supervise External Goal',
      description: 'Compile a rough external-world task into a GoalContract, start the supervised goal, and require goal status alignment before external execution',
      runtimeEventKind: 'supervise_external_goal',
      parameters: {
        type: 'object',
        required: ['userMessage'],
        properties: {
          ...runtimeParameterProperties(),
          userMessage: { type: 'string' },
          receivedAt: { type: 'string' },
          deadlineHours: { type: 'number' },
          replaceActiveGoal: { type: 'boolean' },
        },
      },
      execute: async (api, params) =>
        runGoalEngineCli(api, {
          command: 'entrypoint',
          entrypoint: 'supervise external goal',
          params,
          payloadKeys: ['userMessage', 'receivedAt', 'deadlineHours', 'replaceActiveGoal'],
        }),
    },
    {
      name: 'goal_engine_show_goal_status',
      label: 'Goal Engine Show Goal Status',
      description: 'Show the current Goal Engine goal, guidance, and projection freshness summary. For a new external task, use expectedGoalTitle first; if alignment is blocked, stop and do not search or browse until Goal Engine actions resolve it.',
      runtimeEventKind: 'show_goal_status',
      parameters: {
        type: 'object',
        properties: {
          ...runtimeParameterProperties(),
          expectedGoalTitle: { type: 'string' },
        },
      },
      execute: async (api, params) =>
        runGoalEngineCli(api, {
          command: 'entrypoint',
          entrypoint: 'show goal status',
          params,
          payloadKeys: ['expectedGoalTitle'],
        }),
    },
    {
      name: 'goal_engine_record_failed_attempt',
      label: 'Goal Engine Record Failed Attempt',
      description: 'Write a failed attempt into Goal Engine and refresh guidance',
      runtimeEventKind: 'record_failed_attempt',
      parameters: {
        type: 'object',
        required: ['stage', 'actionTaken', 'strategyTags', 'failureType'],
        properties: {
          ...runtimeParameterProperties(),
          stage: { type: 'string' },
          actionTaken: { type: 'string' },
          strategyTags: { type: 'array', items: { type: 'string' } },
          failureType: { enum: [...FAILURE_TYPE_INPUTS] },
          confidence: { type: 'number' },
          nextHypothesis: { type: 'string' },
        },
      },
      execute: async (api, params) =>
        runGoalEngineCli(api, {
          command: 'entrypoint',
          entrypoint: 'record failed attempt',
          params,
          payloadKeys: ['stage', 'actionTaken', 'strategyTags', 'failureType', 'confidence', 'nextHypothesis'],
        }),
    },
    {
      name: 'goal_engine_recover_current_goal',
      label: 'Goal Engine Recover Current Goal',
      description: 'Recover the current Goal Engine goal and rebuild projection if needed',
      parameters: runtimeParameters(),
      runtimeEventKind: 'recover_current_goal',
      execute: async (api, params) =>
        runGoalEngineCli(api, {
          command: 'entrypoint',
          entrypoint: 'recover current goal',
          params,
        }),
    },
    {
      name: 'goal_engine_check_retry',
      label: 'Goal Engine Check Retry',
      description: 'Run the Goal Engine retry guard before repeating work',
      runtimeEventKind: 'check_retry',
      parameters: {
        type: 'object',
        required: ['plannedAction', 'whatChanged', 'strategyTags', 'policyAcknowledged'],
        properties: {
          ...runtimeParameterProperties(),
          plannedAction: { type: 'string' },
          whatChanged: { type: 'string' },
          strategyTags: { type: 'array', items: { type: 'string' } },
          policyAcknowledged: { type: 'boolean' },
        },
      },
      execute: async (api, params) =>
        runGoalEngineCli(api, {
          command: 'entrypoint',
          entrypoint: 'check retry',
          params,
          payloadKeys: ['plannedAction', 'whatChanged', 'strategyTags', 'policyAcknowledged'],
        }),
    },
  ];
}

function runtimeParameters(): Record<string, unknown> {
  return {
    type: 'object',
    properties: runtimeParameterProperties(),
  };
}

function runtimeParameterProperties(): Record<string, unknown> {
  return {
    agentId: { type: 'string' },
    agentName: { type: 'string' },
    workspace: { type: 'string' },
    session: { type: 'string' },
  };
}

function registerExternalToolGuards(api: OpenClawPluginApi): void {
  const register = api.on
    ? (handler: (event: unknown) => Promise<unknown> | unknown) =>
        api.on?.('before_tool_call', handler, { name: 'goal-engine-external-tool-guard', priority: 100 })
    : api.registerHook
      ? (handler: (event: unknown) => Promise<unknown> | unknown) =>
          api.registerHook?.('before_tool_call', handler, { name: 'goal-engine-external-tool-guard', priority: 100 })
      : null;

  if (!register) {
    api.logger?.warn?.('goal-engine: before_tool_call hook unavailable; external-tool guard not registered');
    return;
  }

  register((event: unknown) => {
    const toolName = extractToolName(event);
    if (!toolName || !isExternalTool(toolName)) {
      return undefined;
    }

    const config = resolveConfig(api);
    const guard = readExternalToolGuard({ runtimeStatePath: config.runtimeStatePath });
    const runtimeContext = extractRuntimeContextFromHookEvent(event, config.runtimeStatePath);
    api.logger?.info?.(`goal-engine: before_tool_call saw external tool "${toolName}" with guard status "${guard?.status ?? 'none'}"`);

    if (!guard) {
      api.logger?.warn?.(`goal-engine: blocking "${toolName}" because no Goal Engine gate state is available`);
      recordRuntimeEvent(api, runtimeContext, {
        id: `external_tool_guard:${Date.now()}:missing`,
        kind: 'external_tool_guard',
        status: 'blocked',
        title: '外部工具被阻止',
        summary: `尝试调用 ${toolName}，但当前没有 Goal Engine gate 状态。`,
        detail: '必须先调用 goal_engine_show_goal_status(expectedGoalTitle=...)。',
        createdAt: new Date().toISOString(),
      });
      return {
        block: true,
        message: 'Goal Engine gate missing. Call goal_engine_show_goal_status with expectedGoalTitle before external search or browsing.',
      };
    }

    if (guard.status === 'clear') {
      return undefined;
    }

    api.logger?.warn?.(`goal-engine: blocking "${toolName}" because guard status is "${guard.status}"`);
    recordRuntimeEvent(api, runtimeContext, {
      id: `external_tool_guard:${Date.now()}:${guard.status}`,
      kind: 'external_tool_guard',
      status: guard.status === 'blocked' ? 'blocked' : 'warning',
      title: '外部工具被阻止',
      summary: `尝试调用 ${toolName}，但 Goal Engine 尚未放行外部执行。`,
      detail: `原因：${guard.reason} | 下一步：${guard.nextAction}`,
      createdAt: new Date().toISOString(),
    });
    return {
      block: true,
      message: [
        `Goal Engine external-tool guard: ${guard.reason}`,
        `Next action: ${guard.nextAction}`,
      ].join('\n'),
    };
  });
}

function extractToolName(event: unknown): string | null {
  if (typeof event !== 'object' || event === null) {
    return null;
  }

  const record = event as Record<string, unknown>;
  const direct = record.toolName;
  if (typeof direct === 'string' && direct.length > 0) {
    return direct;
  }

  const name = record.name;
  if (typeof name === 'string' && name.length > 0) {
    return name;
  }

  const tool = record.tool;
  if (typeof tool === 'object' && tool !== null && 'name' in tool && typeof tool.name === 'string') {
    return tool.name;
  }

  return null;
}

function extractRuntimeContextFromHookEvent(
  event: unknown,
  runtimeStatePath?: string
): RuntimeContext {
  if (typeof event !== 'object' || event === null) {
    return resolveRuntimeContextFromState(runtimeStatePath);
  }

  const record = event as Record<string, unknown>;
  const explicit = {
    agentId: readOptionalString(record.agentId),
    agentName: readOptionalString(record.agentName),
    workspace: readOptionalString(record.workspace),
    session: readOptionalString(record.session),
  };

  if (explicit.agentId || explicit.agentName || explicit.workspace || explicit.session) {
    return explicit;
  }

  return resolveRuntimeContextFromState(runtimeStatePath);
}

function isExternalTool(toolName: string): boolean {
  if (EXTERNAL_TOOL_NAMES.has(toolName)) {
    return true;
  }

  return toolName.startsWith('browser_')
    || toolName.startsWith('mcp__playwright__browser_')
    || toolName.startsWith('mcp__exa__web_');
}

async function runGoalEngineCli(
  api: OpenClawPluginApi,
  input: {
    command: 'bootstrap' | 'entrypoint';
    entrypoint?: string;
    params: Record<string, unknown>;
    payloadKeys?: string[];
  }
): Promise<unknown> {
  const config = resolveConfig(api);
  const args: string[] = ['openclaw', input.command];

  if (input.command === 'entrypoint') {
    if (!input.entrypoint) {
      throw new Error('Missing Goal Engine entrypoint name.');
    }
    args.push(input.entrypoint);
  }

  if (config.serviceUrl) {
    args.push('--service-url', config.serviceUrl);
  }
  if (config.workspaceStatePath) {
    args.push('--workspace-state', config.workspaceStatePath);
  }
  if (config.runtimeStatePath) {
    args.push('--runtime-state', config.runtimeStatePath);
  }

  const runtimeContext = resolveRuntimeContext(input.params, config);
  if (runtimeContext.agentId && runtimeContext.agentName && runtimeContext.workspace && runtimeContext.session) {
    args.push(
      '--agent-id',
      runtimeContext.agentId,
      '--agent-name',
      runtimeContext.agentName,
      '--workspace',
      runtimeContext.workspace,
      '--session',
      runtimeContext.session
    );
  }

  if (input.payloadKeys && input.payloadKeys.length > 0) {
    const payload = buildPayload(input.params, input.payloadKeys);
    if (Object.keys(payload).length > 0) {
      args.push('--payload', JSON.stringify(payload));
    }
  }

  api.logger?.debug?.(`goal-engine: running \`pnpm ${args.join(' ')}\``);

  const { stdout, stderr } = await execFileAsync('pnpm', args, {
    cwd: config.adapterDir,
    env: {
      ...process.env,
      ...(runtimeContext.agentId ? { OPENCLAW_AGENT_ID: runtimeContext.agentId } : {}),
      ...(runtimeContext.agentName ? { OPENCLAW_AGENT_NAME: runtimeContext.agentName } : {}),
      ...(runtimeContext.workspace ? { OPENCLAW_WORKSPACE: runtimeContext.workspace } : {}),
      ...(runtimeContext.session ? { OPENCLAW_SESSION: runtimeContext.session } : {}),
    },
  });

  if (stderr.trim().length > 0) {
    api.logger?.debug?.(`goal-engine: stderr ${stderr.trim()}`);
  }

  const output = stdout.trim();
  try {
    return JSON.parse(output);
  } catch {
    return {
      ok: true,
      raw: output,
    };
  }
}

function resolveConfig(api: OpenClawPluginApi): Required<Omit<GoalEnginePluginConfig, 'runtime'>> & {
  runtime: { preferEnvContext: boolean };
} {
  const pluginConfig = api.config?.plugins?.entries?.['goal-engine']?.config ?? {};

  return {
    serviceUrl: readString(pluginConfig.serviceUrl, process.env.GOAL_ENGINE_SERVICE_URL || 'http://localhost:3100'),
    adapterDir: readString(pluginConfig.adapterDir, defaultAdapterDir),
    workspaceStatePath: readString(pluginConfig.workspaceStatePath, resolve(repoRoot, '.openclaw', 'workspace-state.json')),
    runtimeStatePath: readString(pluginConfig.runtimeStatePath, resolve(repoRoot, '.openclaw', 'runtime-state.json')),
    runtime: {
      preferEnvContext: readBoolean(pluginConfig.runtime?.preferEnvContext, true),
    },
  };
}

function resolveRuntimeContext(
  params: Record<string, unknown>,
  config: Required<Omit<GoalEnginePluginConfig, 'runtime'>> & {
    runtime: { preferEnvContext: boolean };
  }
): RuntimeContext {
  const explicit = {
    agentId: readOptionalString(params.agentId),
    agentName: readOptionalString(params.agentName),
    workspace: readOptionalString(params.workspace),
    session: readOptionalString(params.session),
  };
  const fallback = resolveFallbackRuntimeContext(config);

  if (explicit.agentId || explicit.agentName || explicit.workspace || explicit.session) {
    return {
      agentId: explicit.agentId ?? fallback.agentId,
      agentName: explicit.agentName ?? fallback.agentName,
      workspace: explicit.workspace ?? fallback.workspace,
      session: explicit.session ?? fallback.session,
    };
  }

  return fallback;
}

function resolveFallbackRuntimeContext(
  config: Required<Omit<GoalEnginePluginConfig, 'runtime'>> & {
    runtime: { preferEnvContext: boolean };
  }
): RuntimeContext {
  if (!config.runtime.preferEnvContext) {
    return {};
  }

  const envContext = {
    agentId: process.env.OPENCLAW_AGENT_ID,
    agentName: process.env.OPENCLAW_AGENT_NAME,
    workspace: process.env.OPENCLAW_WORKSPACE,
    session: process.env.OPENCLAW_SESSION,
  };
  const currentManagedAgent = readCurrentManagedAgent({
    runtimeStatePath: config.runtimeStatePath,
  });
  const stateContext = currentManagedAgent
    ? {
        agentId: currentManagedAgent.agentId,
        agentName: currentManagedAgent.agentName,
        workspace: currentManagedAgent.workspace,
        session: currentManagedAgent.session,
      }
    : {};

  return {
    agentId: envContext.agentId ?? stateContext.agentId,
    agentName: envContext.agentName ?? stateContext.agentName,
    workspace: envContext.workspace ?? stateContext.workspace,
    session: envContext.session ?? stateContext.session,
  };
}

function resolveRuntimeContextFromState(runtimeStatePath?: string): RuntimeContext {
  const currentManagedAgent = readCurrentManagedAgent({
    runtimeStatePath,
  });
  if (!currentManagedAgent) {
    return {};
  }

  return {
    agentId: currentManagedAgent.agentId,
    agentName: currentManagedAgent.agentName,
    workspace: currentManagedAgent.workspace,
    session: currentManagedAgent.session,
  };
}

function buildPayload(params: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(
    keys
      .filter((key) => params[key] !== undefined)
      .map((key) => [key, params[key]])
  );
}

function buildRuntimeEvent(input: {
  kind: GoalEngineRuntimeEvent['kind'];
  params: Record<string, unknown>;
  result?: unknown;
  error?: unknown;
  startedAt: string;
}): GoalEngineRuntimeEvent {
  const createdAt = new Date().toISOString();
  const id = `${input.kind}:${Date.now()}`;
  const rawSummary = extractSummaryText(input.result);

  if (input.error) {
    return {
      id,
      kind: input.kind,
      status: 'error',
      title: resolveRuntimeEventTitle(input.kind, 'error'),
      summary: resolveRuntimeEventErrorSummary(input.kind, input.error),
      detail: String(input.error),
      createdAt,
    };
  }

  if (input.kind === 'show_goal_status') {
    return buildGoalStatusRuntimeEvent({
      id,
      params: input.params,
      rawSummary,
      createdAt,
    });
  }

  if (input.kind === 'start_goal') {
    const title = readOptionalString(input.params.title) ?? '未命名目标';
    const replaced = input.params.replaceActiveGoal === true;
    return {
      id,
      kind: input.kind,
      status: 'ok',
      title: replaced ? '替换并开始目标' : '开始目标',
      summary: replaced ? `已替换当前目标并开始：${title}` : `已开始目标：${title}`,
      detail: rawSummary,
      createdAt,
    };
  }

  if (input.kind === 'supervise_external_goal') {
    const userMessage = readOptionalString(input.params.userMessage) ?? '外部目标';
    return {
      id,
      kind: input.kind,
      status: 'ok',
      title: '外部目标接管',
      summary: `已把外部任务接管为 GoalContract：${userMessage}`,
      detail: rawSummary,
      createdAt,
    };
  }

  if (input.kind === 'record_failed_attempt') {
    return {
      id,
      kind: input.kind,
      status: 'warning',
      title: '失败写回',
      summary: [
        readOptionalString(input.params.stage),
        readOptionalString(input.params.actionTaken),
      ].filter(Boolean).join(' · ') || '已把失败写回 Goal Engine。',
      detail: rawSummary,
      createdAt,
    };
  }

  if (input.kind === 'recover_current_goal') {
    return {
      id,
      kind: input.kind,
      status: 'ok',
      title: '恢复当前目标',
      summary: rawSummary || '已请求恢复当前 goal。',
      createdAt,
    };
  }

  if (input.kind === 'check_retry') {
    const blocked = rawSummary.includes('blocked') || rawSummary.includes('不允许') || rawSummary.includes('阻断');
    return {
      id,
      kind: input.kind,
      status: blocked ? 'warning' : 'ok',
      title: blocked ? '重试阻断' : '重试检查',
      summary: rawSummary || '已执行重试检查。',
      createdAt,
    };
  }

  return {
    id,
    kind: input.kind,
    status: 'ok',
    title: resolveRuntimeEventTitle(input.kind, 'ok'),
    summary: rawSummary || resolveRuntimeEventDefaultSummary(input.kind),
    createdAt,
  };
}

function ensureRecentAlignmentGateForStartGoal(
  api: OpenClawPluginApi,
  runtimeContext: RuntimeContext,
  params: Record<string, unknown>,
  startedAt: string
): void {
  if (!runtimeContext.agentId || !runtimeContext.agentName || !runtimeContext.workspace || !runtimeContext.session) {
    return;
  }

  const expectedTitle = readOptionalString(params.title);
  if (!expectedTitle) {
    return;
  }

  const config = resolveConfig(api);
  const recentEvents = readGoalEngineRuntimeEvents({
    runtimeStatePath: config.runtimeStatePath,
    agentId: runtimeContext.agentId,
  });
  const hasRecentAlignmentGate = recentEvents.some((event) =>
    event.kind === 'show_goal_status'
    && Math.abs(Date.parse(startedAt) - Date.parse(event.createdAt)) <= ALIGNMENT_GATE_WINDOW_MS
  );

  if (hasRecentAlignmentGate) {
    return;
  }

  recordRuntimeEvent(api, runtimeContext, {
    id: `workflow_violation:${Date.now()}`,
    kind: 'external_tool_guard',
    status: 'blocked',
    title: '顺序违规',
    summary: `开始目标“${expectedTitle}”前没有先执行 goal alignment gate。`,
    detail: '对新的外部任务，应该先调用 goal_engine_show_goal_status(expectedGoalTitle=...)，确认 blocked 或 aligned 后再决定是否 start_goal。',
    createdAt: startedAt,
  });

  throw new Error(
    'Goal Engine alignment gate missing. Call goal_engine_show_goal_status with expectedGoalTitle before goal_engine_start_goal.'
  );
}

function buildGoalStatusRuntimeEvent(input: {
  id: string;
  params: Record<string, unknown>;
  rawSummary: string;
  createdAt: string;
}): GoalEngineRuntimeEvent {
  const expectedGoalTitle = readOptionalString(input.params.expectedGoalTitle);
  const alignmentBlocked = input.rawSummary.includes('Goal alignment: blocked.');
  const noActiveGoal = input.rawSummary.includes('No active goal right now.');
  const projectionStale = input.rawSummary.includes('local projection still points to');

  if (alignmentBlocked) {
    return {
      id: input.id,
      kind: 'show_goal_status',
      status: 'blocked',
      title: '对齐阻塞',
      summary: expectedGoalTitle
        ? `当前任务“${expectedGoalTitle}”尚未被 Goal Engine 接管。`
        : '当前任务尚未与 active goal 对齐。',
      detail: input.rawSummary,
      createdAt: input.createdAt,
    };
  }

  if (noActiveGoal) {
    return {
      id: input.id,
      kind: 'show_goal_status',
      status: 'warning',
      title: '无活动目标',
      summary: '当前还没有 active goal。',
      detail: input.rawSummary,
      createdAt: input.createdAt,
    };
  }

  if (projectionStale) {
    return {
      id: input.id,
      kind: 'show_goal_status',
      status: 'warning',
      title: '投影滞后',
      summary: 'service active goal 已变化，但本地 projection 还没有跟上。',
      detail: input.rawSummary,
      createdAt: input.createdAt,
    };
  }

  return {
    id: input.id,
    kind: 'show_goal_status',
    status: 'ok',
    title: '对齐确认',
    summary: expectedGoalTitle
      ? `任务“${expectedGoalTitle}”已经通过 Goal Engine 对齐检查。`
      : '当前 active goal 已通过对齐检查。',
    detail: input.rawSummary,
    createdAt: input.createdAt,
  };
}

function extractSummaryText(result: unknown): string {
  if (typeof result === 'string') {
    return result;
  }

  if (typeof result === 'object' && result !== null) {
    const record = result as Record<string, unknown>;
    if (typeof record.summary === 'string') {
      return record.summary;
    }
    if (typeof record.raw === 'string') {
      const nestedSummary = extractNestedSummaryFromRaw(record.raw);
      return nestedSummary ?? record.raw;
    }
  }

  return '';
}

function extractNestedSummaryFromRaw(raw: string): string | null {
  const jsonStart = raw.lastIndexOf('\n{');
  const candidate = (jsonStart >= 0 ? raw.slice(jsonStart + 1) : raw).trim();

  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    if (typeof parsed.summary === 'string') {
      return parsed.summary;
    }
    if (typeof parsed.entrypoint === 'string' && typeof parsed.summary === 'string') {
      return parsed.summary;
    }
  } catch {
    return null;
  }

  return null;
}

function resolveRuntimeEventTitle(
  kind: GoalEngineRuntimeEvent['kind'],
  status: GoalEngineRuntimeEvent['status']
): string {
  if (kind === 'bootstrap') {
    return status === 'error' ? 'Goal Engine 启动失败' : 'Goal Engine 启动';
  }
  return kind;
}

function resolveRuntimeEventDefaultSummary(kind: GoalEngineRuntimeEvent['kind']): string {
  switch (kind) {
    case 'bootstrap':
      return '已同步 Goal Engine 与当前 OpenClaw 会话。';
    case 'supervise_external_goal':
      return '已把外部任务编译为 GoalContract。';
    case 'recover_current_goal':
      return '已请求恢复当前 goal。';
    case 'check_retry':
      return '已执行重试检查。';
    default:
      return 'Goal Engine 运行事件。';
  }
}

function resolveRuntimeEventErrorSummary(
  kind: GoalEngineRuntimeEvent['kind'],
  error: unknown
): string {
  const message = error instanceof Error ? error.message : String(error);
  switch (kind) {
    case 'bootstrap':
      return `Goal Engine 启动失败：${message}`;
    case 'show_goal_status':
      return `读取 goal 状态失败：${message}`;
    case 'supervise_external_goal':
      return `接管外部目标失败：${message}`;
    default:
      return `${resolveRuntimeEventTitle(kind, 'error')}：${message}`;
  }
}

function recordRuntimeEvent(
  api: OpenClawPluginApi,
  runtimeContext: RuntimeContext,
  event: GoalEngineRuntimeEvent
): void {
  if (!runtimeContext.agentId || !runtimeContext.agentName || !runtimeContext.workspace || !runtimeContext.session) {
    return;
  }

  const config = resolveConfig(api);
  appendGoalEngineRuntimeEvent({
    runtimeStatePath: config.runtimeStatePath,
    runtimeContext: {
      agentId: runtimeContext.agentId,
      agentName: runtimeContext.agentName,
      workspace: runtimeContext.workspace,
      session: runtimeContext.session,
    },
    event,
  });
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : fallback;
}

function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}
