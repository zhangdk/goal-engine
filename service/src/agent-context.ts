export type AgentContext = {
  agentId: string;
};

export const DEFAULT_AGENT_ID = 'goal-engine-demo';

const AGENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export class InvalidAgentIdError extends Error {
  constructor() {
    super('Invalid X-Agent-Id');
    this.name = 'InvalidAgentIdError';
  }
}

export function resolveAgentContext(headers: Headers): AgentContext {
  const raw = headers.get('X-Agent-Id') ?? headers.get('x-agent-id') ?? DEFAULT_AGENT_ID;
  const agentId = raw.trim();

  if (!AGENT_ID_PATTERN.test(agentId)) {
    throw new InvalidAgentIdError();
  }

  return { agentId };
}
