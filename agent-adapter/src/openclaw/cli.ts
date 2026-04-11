import { DEFAULT_SERVICE_URL } from '../config.js';
import { AdapterClient } from '../client.js';
import { bootstrapSession } from './bootstrap-session.js';
import { dispatchEntrypoint, type DispatchEntrypointInput } from './dispatch-entrypoint.js';
import { readCurrentManagedAgent, syncRuntimeStateFromWorkspace } from './runtime-state.js';

export type OpenClawCliCommand =
  | {
    kind: 'bootstrap';
    serviceUrl: string;
    workspaceStatePath?: string;
    runtimeStatePath?: string;
    runtimeContext?: {
      agentId: string;
      agentName: string;
      workspace: string;
      session: string;
    };
  }
  | {
    kind: 'entrypoint';
    serviceUrl: string;
    workspaceStatePath?: string;
    runtimeStatePath?: string;
    runtimeContext?: {
      agentId: string;
      agentName: string;
      workspace: string;
      session: string;
    };
    request: DispatchEntrypointInput;
  };

export function parseOpenClawCliArgs(argv: string[]): OpenClawCliCommand {
  if (argv.length === 0) {
    throw new Error('Missing command. Use `bootstrap` or `entrypoint`.');
  }

  const [command, ...rest] = argv;
  const { positional, options } = parseFlags(rest);
  const serviceUrl = options['service-url'] ?? DEFAULT_SERVICE_URL;

  if (command === 'bootstrap') {
    return {
      kind: 'bootstrap',
      serviceUrl,
      workspaceStatePath: options['workspace-state'],
      runtimeStatePath: options['runtime-state'],
      runtimeContext: parseRuntimeContext(options),
    };
  }

  if (command === 'entrypoint') {
    const [entrypointName, ...unexpected] = positional;
    if (!entrypointName) {
      throw new Error('Missing entrypoint name. Use one of: start goal, show goal status, record failed attempt, recover current goal, check retry.');
    }
    if (unexpected.length > 0) {
      throw new Error(`Unexpected positional arguments: ${unexpected.join(' ')}`);
    }

    return {
      kind: 'entrypoint',
      serviceUrl,
      workspaceStatePath: options['workspace-state'],
      runtimeStatePath: options['runtime-state'],
      runtimeContext: parseRuntimeContext(options),
      request: {
        entrypoint: entrypointName as DispatchEntrypointInput['entrypoint'],
        input: parsePayload(options.payload),
      } as DispatchEntrypointInput,
    };
  }

  throw new Error(`Unknown command: ${command}. Use \`bootstrap\` or \`entrypoint\`.`);
}

export async function runOpenClawCli(
  argv: string[],
  dependencies: {
    bootstrapSession: typeof bootstrapSession;
    dispatchEntrypoint: typeof dispatchEntrypoint;
    createClient: (serviceUrl: string, agentId?: string) => AdapterClient;
    writeStdout: (text: string) => void;
  } = {
    bootstrapSession,
    dispatchEntrypoint,
    createClient: (serviceUrl, agentId) => new AdapterClient(serviceUrl, globalThis.fetch, agentId),
    writeStdout: text => process.stdout.write(text),
  }
): Promise<void> {
  const command = parseOpenClawCliArgs(argv);
  syncRuntimeStateFromWorkspace({
    workspaceStatePath: command.workspaceStatePath,
    runtimeStatePath: command.runtimeStatePath,
    runtimeContext: command.runtimeContext,
  });
  const client = dependencies.createClient(command.serviceUrl, resolveAgentId(command));

  if (command.kind === 'bootstrap') {
    const result = await dependencies.bootstrapSession(client, {
      workspaceStatePath: command.workspaceStatePath,
    });
    dependencies.writeStdout(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  const result = await dependencies.dispatchEntrypoint(client, command.request, {
    runtimeStatePath: command.runtimeStatePath,
    runtimeContext: command.runtimeContext,
  });
  dependencies.writeStdout(`${JSON.stringify(result, null, 2)}\n`);
}

function resolveAgentId(command: OpenClawCliCommand): string | undefined {
  if (command.runtimeContext?.agentId) {
    return command.runtimeContext.agentId;
  }

  return readCurrentManagedAgent({ runtimeStatePath: command.runtimeStatePath })?.agentId;
}

export function formatCliError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }

  if (typeof err === 'object' && err !== null && 'message' in err && typeof err.message === 'string') {
    return err.message;
  }

  if (typeof err === 'string') {
    return err;
  }

  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function parseFlags(argv: string[]): {
  positional: string[];
  options: Record<string, string>;
} {
  const positional: string[] = [];
  const options: Record<string, string> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }

    const name = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for --${name}`);
    }

    options[name] = value;
    index += 1;
  }

  return { positional, options };
}

function parsePayload(payload: string | undefined): Record<string, unknown> {
  if (!payload) {
    return {};
  }

  const parsed = JSON.parse(payload) as unknown;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Payload must be a JSON object.');
  }

  return parsed as Record<string, unknown>;
}

function parseRuntimeContext(options: Record<string, string>):
  | {
    agentId: string;
    agentName: string;
    workspace: string;
    session: string;
  }
  | undefined {
  const agentId = options['agent-id'] ?? process.env['OPENCLAW_AGENT_ID'];
  const agentName = options['agent-name'] ?? process.env['OPENCLAW_AGENT_NAME'];
  const workspace = options.workspace ?? process.env['OPENCLAW_WORKSPACE'];
  const session = options.session ?? process.env['OPENCLAW_SESSION'];

  if (!agentId && !agentName && !workspace && !session) {
    return undefined;
  }

  if (!agentId || !agentName || !workspace || !session) {
    throw new Error('Runtime context requires --agent-id, --agent-name, --workspace, and --session together.');
  }

  return {
    agentId,
    agentName,
    workspace,
    session,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runOpenClawCli(process.argv.slice(2)).catch((err: unknown) => {
    const message = formatCliError(err);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
