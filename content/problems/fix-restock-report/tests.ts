import type { Instance, Rng, TestCase, TestSuite } from '@forge/problem-kit';
import { report, type Stock, trickyStock } from './generator.ts';

const t = (id: string, category: string, stock: Stock, threshold: number): TestCase => ({
  id,
  category,
  args: [stock, threshold],
  expected: report(stock, threshold),
});

export default function tests(instance: Instance, { rng }: { rng: Rng }): TestSuite {
  const { example, threshold } = instance.data as { example: Stock; threshold: number };
  const th2 = rng.int(3, 50);
  return {
    visible: [t('example', 'example', example, threshold), t('empty', 'no stock', [], threshold)],
    hidden: [
      t(
        'exact',
        'quantity exactly at the threshold',
        [
          ['widget', th2],
          ['gadget', th2 + 1],
        ],
        th2,
      ),
      t(
        'split',
        'product split across warehouses',
        [
          ['widget', th2 - 1],
          ['widget', 2],
        ],
        th2,
      ),
      t('mixed', 'mixed', trickyStock(rng, th2, 6), th2),
      t(
        'zero',
        'out of stock everywhere',
        [
          ['bolt', 0],
          ['bolt', 0],
          ['nut', th2 * 2],
        ],
        th2,
      ),
    ],
  };
}
