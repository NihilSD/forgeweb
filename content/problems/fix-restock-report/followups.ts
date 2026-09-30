import type { FollowUpQuestion, Instance } from '@forge/problem-kit';

export default function followups(instance: Instance, userCode: string): FollowUpQuestion[] {
  const threshold = Number(instance.params.example_threshold);
  const sample = [
    ['valve', threshold],
    ['hinge', 1],
    ['hinge', threshold],
  ];
  const usesMap = /dict|\{\}|defaultdict|Counter|new Map|Object\.create|\[\w+\]\s*=|\.get\(/.test(
    userCode,
  );
  return [
    {
      id: 'predict',
      kind: 'predict',
      prompt: `What does your fixed function return for stock = ${JSON.stringify(sample)} and threshold = ${threshold}?`,
      answer: { type: 'run', args: [sample, threshold], mode: 'value' },
    },
    {
      id: 'edge-exact',
      kind: 'edge-case',
      prompt:
        'Does your code include a product whose total equals the threshold exactly (stock = [["cable", 7]], threshold = 7)?',
      options: ['Yes', 'No'],
      answer: { type: 'run', args: [[['cable', 7]], 7], mode: 'passes', expected: ['cable'] },
    },
    {
      id: 'explain-merge',
      kind: 'explain',
      prompt:
        'How does your code combine quantities of the same product from different warehouses?',
      options: [
        'A dictionary / map from name to total',
        'Sorting by name and summing neighbours',
        'It does not combine them',
      ],
      answer: {
        type: 'static',
        value: usesMap
          ? 'A dictionary / map from name to total'
          : /sort/.test(userCode)
            ? 'Sorting by name and summing neighbours'
            : 'It does not combine them',
      },
    },
  ];
}
