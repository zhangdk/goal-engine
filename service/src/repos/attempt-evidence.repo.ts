import Database from 'better-sqlite3';
import type { AttemptEvidence } from '../../../shared/types.js';

type AttemptEvidenceRow = {
  id: string;
  agent_id: string;
  goal_id: string;
  attempt_id: string | null;
  kind: string;
  summary: string;
  uri: string | null;
  file_path: string | null;
  tool_name: string | null;
  observed_at: string;
  verifier: string;
  confidence: number;
  created_at: string;
};

function rowToAttemptEvidence(row: AttemptEvidenceRow): AttemptEvidence {
  return {
    id: row.id,
    agentId: row.agent_id,
    goalId: row.goal_id,
    attemptId: row.attempt_id ?? undefined,
    kind: row.kind as AttemptEvidence['kind'],
    summary: row.summary,
    uri: row.uri ?? undefined,
    filePath: row.file_path ?? undefined,
    toolName: row.tool_name ?? undefined,
    observedAt: row.observed_at,
    verifier: row.verifier as AttemptEvidence['verifier'],
    confidence: row.confidence,
    createdAt: row.created_at,
  };
}

export class AttemptEvidenceRepo {
  constructor(private db: Database.Database) {}

  create(evidence: AttemptEvidence): void {
    this.db.prepare(
      `INSERT INTO attempt_evidence (
        id,
        agent_id,
        goal_id,
        attempt_id,
        kind,
        summary,
        uri,
        file_path,
        tool_name,
        observed_at,
        verifier,
        confidence,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      evidence.id,
      evidence.agentId,
      evidence.goalId,
      evidence.attemptId ?? null,
      evidence.kind,
      evidence.summary,
      evidence.uri ?? null,
      evidence.filePath ?? null,
      evidence.toolName ?? null,
      evidence.observedAt,
      evidence.verifier,
      evidence.confidence,
      evidence.createdAt
    );
  }

  listByGoal(agentId: string, goalId: string, opts?: { attemptId?: string; limit?: number }): AttemptEvidence[] {
    const clauses = ['agent_id = ?', 'goal_id = ?'];
    const params: (string | number)[] = [agentId, goalId];

    if (opts?.attemptId) {
      clauses.push('attempt_id = ?');
      params.push(opts.attemptId);
    }

    const limit = Math.min(opts?.limit ?? 50, 100);
    params.push(limit);
    const rows = this.db.prepare(
      `SELECT * FROM attempt_evidence WHERE ${clauses.join(' AND ')} ORDER BY observed_at DESC LIMIT ?`
    ).all(...params) as AttemptEvidenceRow[];
    return rows.map(rowToAttemptEvidence);
  }

  listByIds(agentId: string, goalId: string, ids: string[]): AttemptEvidence[] {
    if (ids.length === 0) {
      return [];
    }
    const placeholders = ids.map(() => '?').join(', ');
    const rows = this.db.prepare(
      `SELECT * FROM attempt_evidence
       WHERE agent_id = ? AND goal_id = ? AND id IN (${placeholders})`
    ).all(agentId, goalId, ...ids) as AttemptEvidenceRow[];
    return rows.map(rowToAttemptEvidence);
  }
}
