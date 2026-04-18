import type { AdapterClient } from '../client.js';
import type { AttemptEvidence } from '../../../shared/types.js';

type EvidenceRecordInput = {
  goalId: string;
  attemptId?: string;
  kind: AttemptEvidence['kind'];
  summary: string;
  uri?: string;
  filePath?: string;
  toolName?: string;
  observedAt?: string;
  verifier?: AttemptEvidence['verifier'];
  confidence?: number;
};

type EvidenceSnake = {
  id: string;
  agent_id?: string;
  goal_id: string;
  attempt_id?: string;
  kind: string;
  summary: string;
  uri?: string;
  file_path?: string;
  tool_name?: string;
  observed_at: string;
  verifier: string;
  confidence: number;
  created_at: string;
};

function toCamel(raw: EvidenceSnake): AttemptEvidence {
  return {
    id: raw.id,
    agentId: raw.agent_id ?? 'goal-engine-demo',
    goalId: raw.goal_id,
    attemptId: raw.attempt_id,
    kind: raw.kind as AttemptEvidence['kind'],
    summary: raw.summary,
    uri: raw.uri,
    filePath: raw.file_path,
    toolName: raw.tool_name,
    observedAt: raw.observed_at,
    verifier: raw.verifier as AttemptEvidence['verifier'],
    confidence: raw.confidence,
    createdAt: raw.created_at,
  };
}

export async function evidenceRecord(client: AdapterClient, input: EvidenceRecordInput): Promise<AttemptEvidence> {
  const raw = await client.post<EvidenceSnake>('/api/v1/evidence', {
    goal_id: input.goalId,
    attempt_id: input.attemptId,
    kind: input.kind,
    summary: input.summary,
    uri: input.uri,
    file_path: input.filePath,
    tool_name: input.toolName,
    observed_at: input.observedAt,
    verifier: input.verifier ?? 'agent',
    confidence: input.confidence ?? 0.5,
  });
  return toCamel(raw);
}
