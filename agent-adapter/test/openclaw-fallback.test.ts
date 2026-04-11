import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(import.meta.dirname, '..', '..');

const fallbackDocs = [
  resolve(repoRoot, 'BOOT.md'),
  resolve(repoRoot, 'openclaw', 'README.md'),
  resolve(repoRoot, 'openclaw', 'goal-engine-entrypoints.md'),
  resolve(repoRoot, 'openclaw', 'workspace', 'goal-engine', 'AGENTS.md'),
  resolve(repoRoot, 'openclaw', 'workspace', 'goal-engine', 'SKILLS.md'),
];

describe('OpenClaw search fallback guidance', () => {
  it('documents multi-search-engine as the preferred fallback when web_search is unavailable after alignment is clear', () => {
    for (const filePath of fallbackDocs) {
      const content = readFileSync(filePath, 'utf-8');

      expect(content).toContain('multi-search-engine');
      expect(content).toMatch(/web_search/i);
    }
  });
});
