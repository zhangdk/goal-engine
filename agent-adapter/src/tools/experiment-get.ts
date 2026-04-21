import type { Experiment } from '../../../shared/types.js';
import type { AdapterClient } from '../client.js';
import { experimentToCamel, type ExperimentSnake } from './experiment-shape.js';

export async function experimentGet(client: AdapterClient, id: string): Promise<Experiment> {
  const raw = await client.get<ExperimentSnake>(`/api/v1/experiments/${encodeURIComponent(id)}`);
  return experimentToCamel(raw);
}
