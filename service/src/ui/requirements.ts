export type RequirementCard = {
  title: string;
  bullets: string[];
};

export const originalIntent: RequirementCard[] = [
  {
    title: 'Original Goal',
    bullets: [
      'Keep a long-running goal active across sessions.',
      'Turn failures into the next round of strategy input.',
      'Reduce repeated mistakes instead of drifting after failure.',
    ],
  },
  {
    title: 'Original Capability',
    bullets: [
      'Persist goal, attempt, reflection, and policy facts in the service.',
      'Expose recovery context without inventing a second source of truth.',
      'Make implementation gaps visible instead of redefining the product target.',
    ],
  },
  {
    title: 'Original Non-Goal',
    bullets: [
      'Not a new definition of whether AI has evolved.',
      'Not a polished general-user frontend.',
      'Not a replacement for the OpenClaw runtime integration work.',
    ],
  },
];

export const currentMvpIntent: RequirementCard[] = [
  {
    title: 'Current MVP Entry Points',
    bullets: [
      'Start Goal',
      'Show Status',
      'Record Failure',
      'Check Retry',
      'Recover',
    ],
  },
  {
    title: 'Current MVP Includes',
    bullets: [
      'Explicit entrypoints backed by the service API.',
      'Reflection-driven policy update after failed attempts.',
      'Recovery packet and projection-based local recovery support.',
    ],
  },
  {
    title: 'Current MVP Excludes',
    bullets: [
      'Natural runtime takeover without explicit user entry.',
      'Completed runtime/plugin/hook wiring.',
      'A normal-user OpenClaw product surface.',
    ],
  },
];
