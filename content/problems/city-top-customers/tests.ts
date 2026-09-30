import type { Instance, Rng, TestCase, TestSuite } from '@forge/problem-kit';
import { type Dataset, expectedRows, makeDataset, setupSql } from './generator.ts';

export default function tests(instance: Instance, { rng }: { rng: Rng }): TestSuite {
  const { city, minCents, sample } = instance.data as {
    city: string;
    minCents: number;
    sample: Dataset;
  };
  const t = (id: string, category: string, d: Dataset): TestCase => ({
    id,
    category,
    setupSql: setupSql(d),
    expected: expectedRows(d, city, minCents),
  });
  return {
    visible: [t('sample', 'sample data', sample)],
    hidden: [
      t('larger', 'more customers', makeDataset(rng, city, minCents, 12)),
      t('nobody', 'no customers qualify', {
        customers: [{ id: 1, name: 'Solo Buyer', city }],
        orders: [{ id: 1, customerId: 1, cents: 100 }],
      }),
      t('mixed', 'mixed cities', makeDataset(rng, city, minCents, 6)),
    ],
  };
}
