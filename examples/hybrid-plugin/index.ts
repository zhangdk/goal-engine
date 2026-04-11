/**
 * Hybrid Context Bridge Plugin
 * 
 * 融合特性：
 * 1. OpenClaw 插件生命周期 (register hooks, tools, services)
 * 2. Goal Engine 工作区上下文处理 (projection 读写)
 * 
 * 核心功能：
 * - 提供工具：同步 goal 状态到本地 projection 文件
 * - 生命周期钩子：自动注入 goal 相关上下文到 agent
 * - 外部工具守卫：拦截外部搜索/浏览器调用，验证 goal 对齐
 */

import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { GoalEngineRuntimeEvent } from '../../../agent-adapter/src/openclaw/runtime-state.js';
import { writeProjections } from '../../workspace/goal-engine/projection-writer.js';

const repoRoot = dirname(fileURLToPath(import.meta.url));

type OpenClawPluginApi = {
  config?: {
    plugins?: {
      entries?: Record<string, { config?: HybridPluginConfig }>;
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
  registerService?: (service: {
    id: string;
    start: () => void | Promise<void>;
    stop: () => void | Promise<void>;
  }) => void;
  resolvePath?: (relativePath: string) => string;
};

type HybridPluginConfig = {
  goalEngineServiceUrl?: string;
  workspaceStatePath?: string;
  runtimeStatePath?: string;
  projectionDir?: string;
  autoSync?: boolean;
};

type RuntimeContext = {
  agentId?: string;
  agentName?: string;
  workspace?: string;
  session?: string;
};

// ==================== 插件入口 ====================

const plugin = {
  id: 'hybrid-context-bridge',
  name: 'Hybrid Context Bridge',
  description: '融合 OpenClaw 插件生命周期与 Goal Engine 工作区上下文的混合插件',
  
  register(api: OpenClawPluginApi) {
    const config = resolveConfig(api);
    
    // 注册外部工具守卫 (Goal Engine 风格)
    registerExternalToolGuard(api, config);
    
    // 注册自定义工具
    registerHybridTools(api, config);
    
    // 注册生命周期钩子
    registerLifecycleHooks(api, config);
    
    // 注册服务
    if (api.registerService) {
      api.registerService({
        id: 'hybrid-context-bridge',
        start: () => {
          api.logger?.info?.('hybrid-context-bridge: plugin started');
        },
        stop: () => {
          api.logger?.info?.('hybrid-context-bridge: plugin stopped');
        },
      });
    }
    
    api.logger?.info?.('hybrid-context-bridge: registered');
  },
};

export default plugin;

// ==================== 工具定义 ====================

function registerHybridTools(api: OpenClawPluginApi, config: HybridPluginConfig): void {
  // 工具1: 同步 Goal 到本地 projection (融合 projection-writer)
  api.registerTool({
    name: 'hybrid_sync_goal',
    label: 'Hybrid Sync Goal',
    description: '将 Goal Engine 当前 goal 同步到本地 projection 文件',
    parameters: {
      type: 'object',
      properties: {
        agentId: { type: 'string' },
        agentName: { type: 'string' },
        workspace: { type: 'string' },
        session: { type: 'string' },
      },
    },
    async execute(_toolCallId, params) {
      const runtimeContext = resolveRuntimeContext(params, config);
      
      // TODO: 从 Goal Engine service 获取 recovery packet 和 policy
      // 这里模拟写入本地 projection
      const mockRecoveryPacket = {
        goalId: 'hybrid-example-goal',
        goalTitle: params.goalTitle as string || '混合插件示例 Goal',
        currentStage: 'initial',
        successCriteria: ['完成插件开发', '通过测试'],
        avoidStrategies: [],
        preferredNextStep: '创建插件骨架',
        lastMeaningfulProgress: '已创建 openclaw.plugin.json',
        lastFailureSummary: null,
        generatedAt: new Date().toISOString(),
      };
      
      const projectionDir = config.projectionDir || resolve(repoRoot, 'projection-output');
      writeProjections({
        recoveryPacket: mockRecoveryPacket as any,
        policy: null,
        projectionDir,
      });
      
      return {
        content: [{ type: 'text', text: `已同步 goal 到 ${projectionDir}` }],
        details: { projectionDir, goalId: mockRecoveryPacket.goalId },
      };
    },
  }, { name: 'hybrid_sync_goal' });
  
  // 工具2: 验证 Goal 对齐 (融合 goal-engine 风格的对齐检查)
  api.registerTool({
    name: 'hybrid_check_alignment',
    label: 'Hybrid Check Alignment',
    description: '验证当前任务是否与 Goal Engine 的 active goal 对齐',
    parameters: {
      type: 'object',
      required: ['expectedGoalTitle'],
      properties: {
        expectedGoalTitle: { type: 'string' },
        agentId: { type: 'string' },
        agentName: { type: 'string' },
        workspace: { type: 'string' },
        session: { type: 'string' },
      },
    },
    async execute(_toolCallId, params) {
      const expectedTitle = params.expectedGoalTitle as string;
      const runtimeContext = resolveRuntimeContext(params, config);
      
      // 模拟对齐检查逻辑
      const alignmentResult = checkAlignment(expectedTitle, runtimeContext);
      
      return {
        content: [{ 
          type: 'text', 
          text: alignmentResult.blocked 
            ? `⚠️ 对齐阻塞: ${alignmentResult.reason}` 
            : `✅ 对齐确认: ${alignmentResult.reason}` 
        }],
        details: alignmentResult,
      };
    },
  }, { name: 'hybrid_check_alignment' });
}

// ==================== 生命周期钩子 ====================

function registerLifecycleHooks(api: OpenClawPluginApi, config: HybridPluginConfig): void {
  const register = api.on
    ? (handler: (event: unknown) => Promise<unknown> | unknown) =>
        api.on?.('before_agent_start', handler, { name: 'hybrid-context-inject', priority: 50 })
    : api.registerHook
      ? (handler: (event: unknown) => Promise<unknown> | unknown) =>
          api.registerHook?.('before_agent_start', handler, { name: 'hybrid-context-inject', priority: 50 })
      : null;

  if (!register) {
    api.logger?.warn?.('hybrid-context-bridge: before_agent_start hook unavailable');
    return;
  }

  // 自动注入 Goal 上下文 (类似 memory-lancedb 的 autoRecall)
  register((event: unknown) => {
    if (!config.autoSync) return;
    
    const prompt = extractPrompt(event);
    if (!prompt || prompt.length < 5) return;
    
    // 检测是否需要注入 goal 上下文
    const goalContext = buildGoalContext(config);
    if (!goalContext) return;
    
    api.logger?.info?.('hybrid-context-bridge: injecting goal context');
    return {
      prependContext: `\n## Current Goal\n\n${goalContext}\n`,
    };
  });
}

// ==================== 外部工具守卫 (Goal Engine 风格) ====================

const EXTERNAL_TOOL_NAMES = new Set([
  'web_search',
  'web_fetch',
  'browser',
  'browser_navigate',
]);

function registerExternalToolGuard(api: OpenClawPluginApi, config: HybridPluginConfig): void {
  const register = api.on
    ? (handler: (event: unknown) => Promise<unknown> | unknown) =>
        api.on?.('before_tool_call', handler, { name: 'hybrid-external-tool-guard', priority: 100 })
    : api.registerHook
      ? (handler: (event: unknown) => Promise<unknown> | unknown) =>
          api.registerHook?.('before_tool_call', handler, { name: 'hybrid-external-tool-guard', priority: 100 })
      : null;

  if (!register) {
    api.logger?.warn?.('hybrid-context-bridge: before_tool_call hook unavailable');
    return;
  }

  register((event: unknown) => {
    const toolName = extractToolName(event);
    if (!toolName || !isExternalTool(toolName)) {
      return undefined;
    }

    api.logger?.info?.(`hybrid-context-bridge: external tool "${toolName}" called`);
    
    // 检查是否已对齐 (简化的 guard 检查)
    const hasGoalContext = checkGoalContext(config);
    
    if (!hasGoalContext) {
      return {
        block: true,
        message: 'Hybrid Context Bridge: No active goal context. Call hybrid_check_alignment first.',
      };
    }

    return undefined;
  });
}

// ==================== 配置解析 ====================

function resolveConfig(api: OpenClawPluginApi): HybridPluginConfig {
  const pluginConfig = api.config?.plugins?.entries?.['hybrid-context-bridge']?.config ?? {};
  
  return {
    goalEngineServiceUrl: pluginConfig.goalEngineServiceUrl || 'http://localhost:3100',
    workspaceStatePath: pluginConfig.workspaceStatePath,
    runtimeStatePath: pluginConfig.runtimeStatePath,
    projectionDir: pluginConfig.projectionDir,
    autoSync: pluginConfig.autoSync ?? true,
  };
}

function resolveRuntimeContext(params: Record<string, unknown>, config: HybridPluginConfig): RuntimeContext {
  return {
    agentId: params.agentId as string || process.env.OPENCLAW_AGENT_ID,
    agentName: params.agentName as string || process.env.OPENCLAW_AGENT_NAME,
    workspace: params.workspace as string || process.env.OPENCLAW_WORKSPACE,
    session: params.session as string || process.env.OPENCLAW_SESSION,
  };
}

// ==================== Helper 函数 ====================

function extractToolName(event: unknown): string | null {
  if (typeof event !== 'object' || event === null) return null;
  const record = event as Record<string, unknown>;
  return typeof record.toolName === 'string' ? record.toolName : null;
}

function isExternalTool(toolName: string): boolean {
  return EXTERNAL_TOOL_NAMES.has(toolName) || toolName.startsWith('browser_');
}

function extractPrompt(event: unknown): string {
  if (typeof event !== 'object' || event === null) return '';
  const record = event as Record<string, unknown>;
  const prompt = record.prompt;
  return typeof prompt === 'string' ? prompt : '';
}

function buildGoalContext(config: HybridPluginConfig): string | null {
  // 从本地 projection 文件读取
  const projectionDir = config.projectionDir || resolve(repoRoot, 'projection-output');
  // TODO: 读取 current-goal.md 并格式化
  return null; // 简化实现
}

function checkGoalContext(config: HybridPluginConfig): boolean {
  // 简化检查：只要配置了 autoSync 就认为有 context
  return config.autoSync === true;
}

function checkAlignment(expectedTitle: string, context: RuntimeContext): {
  blocked: boolean;
  reason: string;
  nextAction?: string;
} {
  // 简化的对齐检查逻辑
  if (!context.agentId || !context.workspace) {
    return {
      blocked: true,
      reason: '缺少运行时上下文',
      nextAction: '提供 agentId, workspace, session 参数',
    };
  }
  
  return {
    blocked: false,
    reason: `任务 "${expectedTitle}" 已对齐`,
  };
}