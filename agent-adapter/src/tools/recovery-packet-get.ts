import type { AdapterClient } from '../client.js';
import type { RecoveryPacket } from '../../../shared/types.js';

type RecoverySnake = {
  goal_id: string;
  goal_title: string;
  current_stage: string;
  success_criteria: string[];
  last_meaningful_progress?: string;
  last_failure_summary?: string;
  avoid_strategies: string[];
  preferred_next_step?: string;
  generated_at: string;
};

function toCamel(raw: RecoverySnake): RecoveryPacket {
  return {
    goalId: raw.goal_id,
    goalTitle: raw.goal_title,
    currentStage: raw.current_stage,
    successCriteria: raw.success_criteria,
    lastMeaningfulProgress: raw.last_meaningful_progress,
    lastFailureSummary: raw.last_failure_summary,
    avoidStrategies: raw.avoid_strategies,
    preferredNextStep: raw.preferred_next_step,
    generatedAt: raw.generated_at,
  };
}

export async function recoveryPacketGet(
  client: AdapterClient,
  goalId: string,
  options?: {
    source?: 'service' | 'projection';
  }
): Promise<RecoveryPacket> {
  const params = new URLSearchParams({
    goal_id: goalId,
  });
  if (options?.source) {
    params.set('source', options.source);
  }

  const raw = await client.get<RecoverySnake>(
    `/api/v1/recovery-packet?${params.toString()}`
  );
  return toCamel(raw);
}
