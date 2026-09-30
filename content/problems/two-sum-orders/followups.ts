import type { FollowUpQuestion, Instance } from '@forge/problem-kit';

/** Verified-mode follow-ups (spec 7.3), graded by running the user's own code. */
export default function followups(
  instance: Instance,
  userCode: string,
  language: string,
): FollowUpQuestion[] {
  const target = Number(instance.params.target);
  const small = [target - 3, 7, 3, 12];
  const usesMap =
    language === 'python'
      ? /\{\}|dict\(|set\(|\bin\s+\w+/.test(userCode)
      : /new Map|\{\}|new Set|\bin\b|has\(/.test(userCode);
  const usesSort = /sort/.test(userCode);
  return [
    {
      id: 'predict-small',
      kind: 'predict',
      prompt: `What does your function return for amounts = ${JSON.stringify(small)} and target = ${target}? Answer as a list like [0, 1].`,
      answer: { type: 'run', args: [small, target], mode: 'value' },
    },
    {
      id: 'edge-equal',
      kind: 'edge-case',
      prompt: 'Does your code return [0, 1] for amounts = [50, 50] and target = 100?',
      options: ['Yes', 'No'],
      answer: { type: 'run', args: [[50, 50], 100], mode: 'passes', expected: [0, 1] },
    },
    {
      id: 'explain-structure',
      kind: 'explain',
      prompt: 'Which approach does your solution use to find the second order?',
      options: [
        'A hash map / dictionary of seen amounts',
        'Sorting and two pointers',
        'Checking every pair',
      ],
      answer: {
        type: 'static',
        value: usesMap
          ? 'A hash map / dictionary of seen amounts'
          : usesSort
            ? 'Sorting and two pointers'
            : 'Checking every pair',
      },
    },
  ];
}
