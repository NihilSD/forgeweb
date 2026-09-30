import type { Instance, Rng, TestCase, TestSuite } from '@forge/problem-kit';
import { makeCase, type TwoSumCase } from './generator.ts';

const toTest = (id: string, category: string, c: TwoSumCase): TestCase => ({
  id,
  category,
  args: [c.amounts, c.target],
  expected: c.answer,
});

export default function tests(instance: Instance, { rng }: { rng: Rng }): TestSuite {
  const { example } = instance.data as { example: TwoSumCase };
  const pairAtEnds = makeCase(rng, 6);
  // Move the pair to the first and last positions.
  const [x, y] = pairAtEnds.answer;
  const rest = pairAtEnds.amounts.filter((_, k) => k !== x && k !== y);
  const ends = {
    ...pairAtEnds,
    amounts: [pairAtEnds.amounts[x]!, ...rest, pairAtEnds.amounts[y]!],
    answer: [0, rest.length + 1] as [number, number],
  };

  return {
    visible: [
      toTest('example', 'example', example),
      toTest('two-orders', 'only two orders', makeCase(rng, 2)),
    ],
    hidden: [
      toTest('equal-pair', 'pair of equal amounts', makeCase(rng, 8, { equalPair: true })),
      toTest('ends', 'pair at both ends', ends),
      toTest('medium', 'medium list', makeCase(rng, 1_000)),
      toTest('large', 'large list (performance)', makeCase(rng, 50_000)),
    ],
  };
}
