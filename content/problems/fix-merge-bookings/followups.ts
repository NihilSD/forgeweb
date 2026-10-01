import type { FollowUpQuestion, Instance } from '@forge/problem-kit';

const SIGNATURE =
  '^\\s*(def |(export\\s+)?(async\\s+)?function\\b|(export\\s+)?(const|let|var)\\s+\\w+\\s*=\\s*(async\\s*)?\\()';

export default function followups(_instance: Instance, userCode: string): FollowUpQuestion[] {
  const sorts = /sort/.test(userCode);
  return [
    {
      id: 'predict',
      kind: 'predict',
      prompt: 'What does your function return for bookings = [[5, 8], [1, 3], [2, 4]]?',
      answer: {
        type: 'run',
        args: [
          [
            [5, 8],
            [1, 3],
            [2, 4],
          ],
        ],
        mode: 'value',
      },
    },
    {
      id: 'edge-touching',
      kind: 'edge-case',
      prompt: 'Does your code merge bookings = [[2, 3], [1, 2]] into [[1, 3]]?',
      options: ['Yes', 'No'],
      answer: {
        type: 'run',
        args: [
          [
            [2, 3],
            [1, 2],
          ],
        ],
        mode: 'passes',
        expected: [[1, 3]],
      },
    },
    {
      id: 'change-touching',
      kind: 'change',
      prompt:
        'Suppose touching bookings (one ends exactly when the next starts) should stay separate. Which line of your code would you change? Enter its line number.',
      answer: {
        type: 'lines',
        pattern: '(<=|>=|[^=<]<[^=]|[^=]>[^=])',
        exclude: `${SIGNATURE}|=>|^\\s*for\\b`,
      },
    },
    {
      id: 'explain-order',
      kind: 'explain',
      prompt: 'How does your code make sure overlapping bookings end up next to each other?',
      options: [
        'It sorts the bookings by start time first',
        'It compares every pair of bookings',
        'It relies on the input already being sorted',
      ],
      answer: {
        type: 'static',
        value: sorts
          ? 'It sorts the bookings by start time first'
          : 'It compares every pair of bookings',
      },
    },
  ];
}
