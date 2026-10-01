import type { Instance, Rng, TestCase, TestSuite } from '@forge/problem-kit';
import { firstIndex, sortedIds } from './generator.ts';

const t = (id: string, category: string, ids: number[], target: number): TestCase => ({
  id,
  category,
  args: [ids, target],
  expected: firstIndex(ids, target),
});

export default function tests(instance: Instance, { rng }: { rng: Rng }): TestSuite {
  const { ids, target } = instance.data as { ids: number[]; target: number };
  const big = sortedIds(rng, 200_000, 6);
  return {
    visible: [
      t('example', 'example', ids, target),
      t('missing', 'id not in the list', [1, 3, 5], 4),
    ],
    hidden: [
      t('empty', 'empty list', [], 7),
      t('all-same', 'every id the same', [9, 9, 9, 9, 9, 9, 9], 9),
      t('at-start', 'repeats at the start', [2, 2, 2, 5, 8, 13], 2),
      t('at-end', 'repeats at the end', [1, 4, 6, 6, 6], 6),
      t('single', 'one id', [42], 42),
      t('before-all', 'smaller than every id', [10, 20, 30], 5),
      t('big', 'a long archive', big, big[rng.int(0, big.length - 1)]!),
    ],
  };
}
