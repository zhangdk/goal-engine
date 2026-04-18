import type { AdapterClient } from '../client.js';
import type { AttemptEvidence, Goal, GoalCompletion } from '../../../shared/types.js';

type GoalCompleteInput = {
  goalId: string;
  evidenceIds: string[];
  summary: string;
};

type GoalCompleteSnake = {
  goal: {
    id: string;
    agent_id?: string;
    title: string;
    status: string;
    success_criteria: string[];
    stop_conditions: string[];
    priority: number;
    current_stage: string;
    created_at: string;
    updated_at: string;
  };
  completion: {
    id: string;
    agent_id?: string;
    goal_id: string;
    evidence_ids: string[];
    summary: string;
    completed_at: string;
  };
  evidence: Array<{
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
  }>;
};

export type GoalCompleteResult = {
  goal: Goal;
  completion: GoalCompletion;
  evidence: AttemptEvidence[];
};

export async function goalComplete(client: AdapterClient, input: GoalCompleteInput): Promise<GoalCompleteResult> {
  const raw = await client.post<GoalCompleteSnake>(`/api/v1/goals/${input.goalId}/complete`, {
    evidence_ids: input.evidenceIds,
    summary: input.summary,
  });

  return {
    goal: {
      id: raw.goal.id,
      agentId: raw.goal.agent_id ?? 'goal-engine-demo',
      title: raw.goal.title,
      status: raw.goal.status as Goal['status'],
      successCriteria: raw.goal.success_criteria,
      stopConditions: raw.goal.stop_conditions,
      priority: raw.goal.priority,
      currentStage: raw.goal.current_stage,
      createdAt: raw.goal.created_at,
      updatedAt: raw.goal.updated_at,
    },
    completion: {
      id: raw.completion.id,
      agentId: raw.completion.agent_id ?? 'goal-engine-demo',
      goalId: raw.completion.goal_id,
      evidenceIds: raw.completion.evidence_ids,
      summary: raw.completion.summary,
      completedAt: raw.completion.completed_at,
    },
    evidence: raw.evidence.map((item) => ({
      id: item.id,
      agentId: item.agent_id ?? 'goal-engine-demo',
      goalId: item.goal_id,
      attemptId: item.attempt_id,
      kind: item.kind as AttemptEvidence['kind'],
      summary: item.summary,
      uri: item.uri,
      filePath: item.file_path,
      toolName: item.tool_name,
      observedAt: item.observed_at,
      verifier: item.verifier as AttemptEvidence['verifier'],
      confidence: item.confidence,
      createdAt: item.created_at,
    })),
  };
}
