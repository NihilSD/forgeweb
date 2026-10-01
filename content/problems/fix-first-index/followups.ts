import type { FollowUpQuestion, Instance } from '@forge/problem-kit';

const SIGNATURE =
  '^\\s*(def |(export\\s+)?(async\\s+)?function\\b|(export\\s+)?(const|let|var)\\s+\\w+\\s*=\\s*(async\\s*)?\\()';

export default function followups(_instance: Instance, userCode: string): FollowUpQuestion[] {
  const library = /bisect|lower_?bound/i.test(userCode);
  const remembers = /\b\w+\s*=\s*mid\b(?!\s*[-+])/.test(userCode);
  return [
    {
      id: 'predict',
      kind: 'predict',
      prompt: 'What does your function return for sorted_ids = [2, 4, 4, 4, 7] and target = 4?',
      answer: { type: 'run', args: [[2, 4, 4, 4, 7], 4], mode: 'value' },
    },
    {
      id: 'edge-empty',
      kind: 'edge-case',
      prompt: 'Does your code return -1 for an empty list (sorted_ids = [], target = 5)?',
      options: ['Yes', 'No'],
      answer: { type: 'run', args: [[], 5], mode: 'passes', expected: -1 },
    },
    {
      id: 'change-last',
      kind: 'change',
      prompt:
        'Suppose the function should return the last occurrence instead of the first. Which line of your code would you change first? Enter its line number.',
      answer: {
        type: 'lines',
        pattern: '\\b(hi|lo|high|low|right|left|end|start)\\s*=\\s*mid|bisect',
        exclude: SIGNATURE,
      },
    },
    {
      id: 'explain-continue',
      kind: 'explain',
      prompt: 'What does your search do when it finds the target?',
      options: [
        'Remembers it and keeps searching to the left',
        'Uses a library lower-bound search (bisect)',
        'Returns straight away',
      ],
      answer: {
        type: 'static',
        value: library
          ? 'Uses a library lower-bound search (bisect)'
          : remembers
            ? 'Remembers it and keeps searching to the left'
            : 'Returns straight away',
      },
    },
  ];
}
