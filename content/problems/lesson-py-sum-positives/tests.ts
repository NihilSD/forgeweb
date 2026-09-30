import type { Instance, Rng, TestSuite } from '@forge/problem-kit';
import { nums, ORACLE } from './generator.ts';

export default function tests(instance: Instance, { rng }: { rng: Rng }): TestSuite {
  const { example } = instance.data as { example: number[] };
  const t = (id: string, category: string, xs: number[]) => ({
    id,
    category,
    args: [xs],
    expected: ORACLE(xs),
  });
  return {
    visible: [t('example', 'example', example)],
    hidden: [
      t('empty', 'empty list', []),
      t('negatives', 'only negatives and zero', [-3, 0, -1]),
      t('first', 'positive first element', [9, -1, 1]),
      t('random', 'random', nums(rng, 40)),
    ],
  };
}
