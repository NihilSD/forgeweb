import type { Instance, Rng, TestCase, TestSuite } from '@forge/problem-kit';
import { average, randomRatings } from './generator.ts';

const t = (id: string, category: string, ratings: number[]): TestCase => ({
  id,
  category,
  args: [ratings],
  expected: average(ratings),
});

export default function tests(instance: Instance, { rng }: { rng: Rng }): TestSuite {
  const { example } = instance.data as { example: number[] };
  const first = rng.int(4, 5);
  return {
    visible: [t('example', 'example', example), t('empty', 'no ratings', [])],
    hidden: [
      t('first-counts', 'the first rating matters', [first, 1, 1, 2]),
      t('only-zeros', 'only skipped ratings', [0, 0, 0]),
      t('single', 'a single rating', [rng.int(1, 5)]),
      t('zeros-inside', 'skipped ratings in the middle', [3, 0, 5, 0, 1]),
      t('random', 'random list', [rng.int(3, 5), 1, ...randomRatings(rng, 50)]),
    ],
  };
}
