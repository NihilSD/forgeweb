import type { Instance, Rng, TestSuite } from '@forge/problem-kit';
import { expected, type Product, products, setup } from './generator.ts';

export default function tests(instance: Instance, { rng }: { rng: Rng }): TestSuite {
  const { sample } = instance.data as { sample: Product[] };
  const t = (id: string, category: string, ps: Product[]) => ({
    id,
    category,
    setupSql: setup(ps),
    expected: expected(ps),
  });
  // Product 0 costs exactly 20.00 and is in stock (catches <= vs <); odd ones are out of stock.
  const edge = products(rng, 6).map((p, i) => ({
    ...p,
    stock: i === 0 ? Math.max(1, p.stock) : i % 2 ? 0 : p.stock,
    price: i === 0 ? 2000 : p.price,
  }));
  return {
    visible: [t('sample', 'sample data', sample)],
    hidden: [
      t('empty', 'empty table', []),
      t('edge', 'edge values', edge),
      t('more', 'more products', products(rng, 16)),
    ],
  };
}
