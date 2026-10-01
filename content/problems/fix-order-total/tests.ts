import type { Instance, Rng, TestCase, TestSuite } from '@forge/problem-kit';
import { orderTotal } from './generator.ts';

const t = (id: string, category: string, prices: number[], discount: number): TestCase => ({
  id,
  category,
  args: [prices, discount],
  expected: orderTotal(prices, discount),
});

export default function tests(instance: Instance, { rng }: { rng: Rng }): TestSuite {
  const { prices, discount } = instance.data as { prices: number[]; discount: number };
  return {
    visible: [t('example', 'example', prices, discount), t('none', 'no discount', [500, 250], 0)],
    hidden: [
      t('full', '100% discount', [999, 1], 100),
      t('rounding', 'a fraction of a cent', [995], 10),
      t('empty', 'empty basket', [], 20),
      t('free-items', 'free items', [0, 0, 300], 50),
      t(
        'many',
        'large basket',
        Array.from({ length: 200 }, () => rng.int(1, 9999)),
        rng.int(1, 99),
      ),
    ],
  };
}
