import type { Instance, Rng, TestSuite } from '@forge/problem-kit';
import { builds, lowerBound, queries } from './generator.ts';

export default function tests(instance: Instance, { rng }: { rng: Rng }): TestSuite {
  const t = (id: string, category: string, xs: number[], qs: number[]) => ({
    id,
    category,
    args: [xs, qs],
    expected: qs.map((q) => lowerBound(xs, q)),
  });
  const { xs, qs } = instance.data as { xs: number[]; qs: number[] };
  const dup = [2, 2, 2, 2, 7, 7, 9];
  const big = builds(rng, 100_000);
  return {
    visible: [t('example', 'example', xs, qs)],
    hidden: [
      t('empty', 'no builds', [], [1, 5]),
      t('duplicates', 'repeated build numbers', dup, [2, 7, 1, 10, 9]),
      t('random', 'random', builds(rng, 200), queries(rng, builds(rng, 200), 50)),
      t('large', 'large input (performance)', big, queries(rng, big, 100_000)),
    ],
  };
}
