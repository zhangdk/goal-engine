import type { AdapterClient } from '../client.js';
import { startGoalSession } from './start-goal-session.js';

export type SuperviseExternalGoalInput = {
  userMessage: string;
  receivedAt?: string;
  deadlineHours?: number;
  replaceActiveGoal?: boolean;
  projectionDir?: string;
};

export type GoalContract = {
  title: string;
  successCriteria: string[];
  stopConditions: string[];
  currentStage: string;
  deadlineAt?: string;
  autonomyLevel: 0 | 1 | 2 | 3 | 4;
  boundaryRules: string[];
  strategyGuidance: string[];
  permissionBoundary: string[];
};

export type SuperviseExternalGoalResult = {
  goalId: string;
  contract: GoalContract;
  summary: string;
};

export async function superviseExternalGoal(
  client: AdapterClient,
  input: SuperviseExternalGoalInput
): Promise<SuperviseExternalGoalResult> {
  const contract = compileGoalContract(input);
  const started = await startGoalSession(client, {
    title: contract.title,
    successCriteria: contract.successCriteria,
    stopConditions: contract.stopConditions,
    currentStage: contract.currentStage,
    priority: 1,
    replaceActiveGoal: input.replaceActiveGoal,
    projectionDir: input.projectionDir,
    contract: {
      outcome: contract.title,
      successEvidence: contract.successCriteria,
      deadlineAt: contract.deadlineAt,
      autonomyLevel: contract.autonomyLevel,
      boundaryRules: contract.boundaryRules,
      stopConditions: contract.stopConditions,
      strategyGuidance: contract.strategyGuidance,
      permissionBoundary: contract.permissionBoundary,
    },
  });

  return {
    goalId: started.goalId,
    contract,
    summary: buildSupervisionSummary(contract, started.summary),
  };
}

export function compileGoalContract(input: SuperviseExternalGoalInput): GoalContract {
  const message = input.userMessage.trim();
  const deadlineHours = input.deadlineHours ?? inferDeadlineHours(message) ?? 24;
  const deadlineAt = input.receivedAt
    ? new Date(new Date(input.receivedAt).getTime() + deadlineHours * 60 * 60 * 1000).toISOString()
    : undefined;

  if (isRevenueGoal(message)) {
    const amount = inferRevenueAmount(message) ?? 100;
    const currency = inferCurrency(message) ?? 'RMB';
    return {
      title: `Revenue Sprint: earn ${amount} ${currency} within ${deadlineHours} hours`,
      currentStage: 'goal-contract',
      successCriteria: [
        `Confirmed revenue is at least ${amount} ${currency} before the deadline.`,
        'Completion requires payment, order confirmation, or user-confirmed equivalent value.',
        'Each attempt must produce external evidence, a concrete sales asset, a channel result, or a recorded permission boundary.',
      ],
      deadlineAt,
      autonomyLevel: 2,
      boundaryRules: [
        'Local research, drafting, target lists, and artifact creation are autonomous.',
        'Private messages, public posts, user-identity actions, payment, and contracts require explicit authorization.',
      ],
      stopConditions: [
        'Stop before sending messages, posting publicly, using user identity, or handling payment without explicit authorization.',
        'Do not claim completion without revenue evidence.',
      ],
      strategyGuidance: [
        'Do not ask the user to choose the strategy.',
        'Prefer high-ticket quick services, buyer-specific outreach assets, and fast channel validation over low-priced artifacts without distribution.',
        'If a channel is blocked, record the failed attempt and change path before retrying.',
      ],
      permissionBoundary: [
        'Local research, drafting, target lists, and artifact creation are autonomous.',
        'Private messages, public posts, user-identity actions, payment, and contracts require explicit authorization.',
        'At a boundary, request the smallest permission needed and keep the rest of the mission active.',
      ],
    };
  }

  return {
    title: `External Goal: ${message.slice(0, 80)}`,
    currentStage: 'goal-contract',
    successCriteria: [
      'The external-world outcome is completed with verifiable evidence.',
      'Each attempt must produce external evidence, a concrete artifact, a channel result, or a recorded permission boundary.',
      ],
      deadlineAt,
      autonomyLevel: 2,
      boundaryRules: [
        'Local analysis and artifact preparation are autonomous.',
        'External sending, public posting, identity use, payment, and legal commitments require explicit authorization.',
      ],
      stopConditions: [
      'Stop before sending messages, posting publicly, using user identity, or handling payment without explicit authorization.',
      'Do not claim completion without success evidence.',
    ],
    strategyGuidance: [
      'Do not ask the user to choose the strategy.',
      'Choose one primary path and one fallback path for the current round.',
      'If blocked, record the failed attempt and state what changes before retrying.',
    ],
    permissionBoundary: [
      'Local analysis and artifact preparation are autonomous.',
      'External sending, public posting, identity use, payment, and legal commitments require explicit authorization.',
    ],
  };
}

function buildSupervisionSummary(contract: GoalContract, startSummary: string): string {
  return [
    'External goal supervised.',
    `Goal contract: ${contract.title}`,
    '',
    startSummary,
    '',
    'Strategy guard:',
    ...contract.strategyGuidance.map(item => `- ${item}`),
    '',
    'Permission boundary:',
    ...contract.permissionBoundary.map(item => `- ${item}`),
    '',
    'Next required action: call show goal status with the same goal title before search, browsing, messaging, or other external execution.',
  ].join('\n');
}

function isRevenueGoal(message: string): boolean {
  return /赚|收入|收款|revenue|earn|make money|income/i.test(message);
}

function inferRevenueAmount(message: string): number | null {
  const match = message.match(/(\d+(?:\.\d+)?)\s*(?:元|块|rmb|RMB|cny|CNY|¥)/);
  if (!match) {
    return null;
  }

  return Number(match[1]);
}

function inferCurrency(message: string): string | null {
  if (/rmb|cny|元|块|¥/i.test(message)) {
    return 'RMB';
  }

  return null;
}

function inferDeadlineHours(message: string): number | null {
  if (/一天|1天|24\s*(?:h|小时|hours?)/i.test(message)) {
    return 24;
  }

  const hourMatch = message.match(/(\d+(?:\.\d+)?)\s*(?:h|小时|hours?)/i);
  if (hourMatch) {
    return Number(hourMatch[1]);
  }

  return null;
}
