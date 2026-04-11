import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const openclawDir = dirname(fileURLToPath(import.meta.url));

export const DEFAULT_PROJECTION_DIR = resolve(
  openclawDir,
  '..',
  '..',
  '..',
  'examples',
  'workspace',
  'goal-engine'
);

export const DEFAULT_WORKSPACE_STATE_PATH = resolve(
  openclawDir,
  '..',
  '..',
  '..',
  '.openclaw',
  'workspace-state.json'
);

export const DEFAULT_RUNTIME_STATE_PATH = resolve(
  openclawDir,
  '..',
  '..',
  '..',
  '.openclaw',
  'runtime-state.json'
);
