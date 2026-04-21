import type { Experiment } from '../../../shared/types.js';
import type { AdapterClient } from '../client.js';
import { experimentToCamel, type ExperimentSnake } from './experiment-shape.js';

export type ExperimentPatchInput = Partial<
  Pick<Experiment, 'stage' | 'actionPlan' | 'expectedSignal' | 'costLevel' | 'boundaryLevel' | 'whyDifferent' | 'status'>
>;

export async function experimentUpdate(
  client: AdapterClient,
  id: string,
  patch: ExperimentPatchInput
): Promise<Experiment> {
  const raw = await client.patch<ExperimentSnake>(`/api/v1/experiments/${encodeURIComponent(id)}`, {
    stage: patch.stage,
    action_plan: patch.actionPlan,
    expected_signal: patch.expectedSignal,
    cost_level: patch.costLevel,
    boundary_level: patch.boundaryLevel,
    why_different: patch.whyDifferent,
    status: patch.status,
  });
  return experimentToCamel(raw);
}
