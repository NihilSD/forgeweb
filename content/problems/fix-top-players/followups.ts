import type { FollowUpQuestion, Instance } from '@forge/problem-kit';

const SIGNATURE =
  '^\\s*(def |(export\\s+)?(async\\s+)?function\\b|(export\\s+)?(const|let|var)\\s+\\w+\\s*=\\s*(async\\s*)?\\()';

export default function followups(_instance: Instance, userCode: string): FollowUpQuestion[] {
  const sums = /\+=|\+\s*points|\)\s*\+\s*\w|\?\?\s*0\)\s*\+|Counter|defaultdict/.test(userCode);
  return [
    {
      id: 'predict',
      kind: 'predict',
      prompt:
        'What does your function return for scores = [["bo", 4], ["al", 3], ["bo", 1], ["al", 2]] and k = 2?',
      answer: {
        type: 'run',
        args: [
          [
            ['bo', 4],
            ['al', 3],
            ['bo', 1],
            ['al', 2],
          ],
          2,
        ],
        mode: 'value',
      },
    },
    {
      id: 'edge-fewer',
      kind: 'edge-case',
      prompt: 'Does your code return ["bo", "al"] for scores = [["al", 3], ["bo", 5]] and k = 5?',
      options: ['Yes', 'No'],
      answer: {
        type: 'run',
        args: [
          [
            ['al', 3],
            ['bo', 5],
          ],
          5,
        ],
        mode: 'passes',
        expected: ['bo', 'al'],
      },
    },
    {
      id: 'change-order',
      kind: 'change',
      prompt:
        'Suppose the board should list the lowest totals first. Which line of your code would you change? Enter its line number.',
      answer: {
        type: 'lines',
        pattern: 'sort|key\\s*=|reverse|-\\s*item|b\\[1\\]\\s*-\\s*a\\[1\\]',
        exclude: SIGNATURE,
      },
    },
    {
      id: 'explain-sum',
      kind: 'explain',
      prompt: "How does your code work out each player's total?",
      options: [
        'A dictionary / map from name to running total',
        "It keeps each player's latest score",
        'It sorts the entries by name and adds up neighbours',
      ],
      answer: {
        type: 'static',
        value: sums
          ? 'A dictionary / map from name to running total'
          : "It keeps each player's latest score",
      },
    },
  ];
}
