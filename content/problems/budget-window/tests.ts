import type { Instance, Rng, TestCase, TestSuite } from '@forge/problem-kit';
import { longest, randomDays } from './generator.ts';

const t = (id: string, category: string, minutes: number[], budget: number): TestCase => ({
  id,
  category,
  args: [minutes, budget],
  expected: longest(minutes, budget),
});

export default function tests(instance: Instance, { rng }: { rng: Rng }): TestSuite {
  const { example, exampleBudget } = instance.data as { example: number[]; exampleBudget: number };
  // Tiny values and a big budget make windows span most of the list, so O(n²) times out.
  const big = randomDays(rng, 100_000, 2);
  const bigBudget = Math.floor(big.reduce((a, b) => a + b, 0) * (0.6 + rng.next() * 0.3));
  const allFit = randomDays(rng, 20, 30);
  const zeros = [
    ...randomDays(rng, 5, 50).map((x) => x + 60),
    0,
    0,
    0,
    0,
    ...randomDays(rng, 4, 50).map((x) => x + 60),
  ];
  return {
    visible: [
      t('example', 'example', example, exampleBudget),
      t('empty', 'no days', [], rng.int(0, 50)),
    ],
    hidden: [
      t(
        'none-fit',
        'no single day fits',
        randomDays(rng, 6, 50).map((x) => x + 100),
        rng.int(10, 99),
      ),
      t('all-fit', 'every day fits', allFit, allFit.reduce((a, b) => a + b, 0) + rng.int(0, 5)),
      t('zeros', 'days with zero minutes', zeros, rng.int(0, 59)),
      t('exact', 'total exactly equals budget', [10, 20, 30, 40], 60),
      t('random', 'random', randomDays(rng, 200, 100), rng.int(100, 1000)),
      t('large', 'large input (performance)', big, bigBudget),
    ],
  };
}
