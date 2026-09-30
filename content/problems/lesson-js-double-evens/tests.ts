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
      t('empty', 'empty array', []),
      t('odds', 'only odd numbers', [1, 3, -5]),
      t('negative', 'negative evens', [-4, 3, -2]),
      t('random', 'random', nums(rng, 30)),
    ],
  };
}
