import type { Knowledge, KnowledgePromotion } from '../../../shared/types.js';

export function formatKnowledgeSections(input: {
  relevantKnowledge: Knowledge[];
  sharedWisdom: KnowledgePromotion[];
}): string[] {
  const lines: string[] = [];

  if (input.relevantKnowledge.length > 0) {
    lines.push('## 历史认知');
    for (const knowledge of input.relevantKnowledge.slice(0, 5)) {
      lines.push(`- 观察：${knowledge.observation}`);
      lines.push(`  可能原因：${knowledge.hypothesis}`);
      lines.push(`  对下一步意味着：${knowledge.implication}`);
    }
  }

  if (input.sharedWisdom.length > 0) {
    lines.push('## 共享建议');
    for (const wisdom of input.sharedWisdom.slice(0, 5)) {
      lines.push(`- ${wisdom.recommendation}`);
    }
  }

  return lines;
}
