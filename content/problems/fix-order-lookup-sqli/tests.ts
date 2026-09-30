import type { Instance, Rng, TestCase, TestSuite } from '@forge/problem-kit';
import { lookup, NAMES, type Order, randomOrders } from './generator.ts';

const t = (id: string, category: string, orders: Order[], customer: string): TestCase => ({
  id,
  category,
  args: [orders, customer],
  expected: lookup(orders, customer),
});

export default function tests(instance: Instance, { rng }: { rng: Rng }): TestSuite {
  const { orders, customer } = instance.data as { orders: Order[]; customer: string };
  const withQuotes: Order[] = [...orders, [100, "Liam O'Brien", 1200], [101, "D'Arcy Fox", 800]];
  const big = randomOrders(rng, NAMES, 60);
  return {
    visible: [
      t('example', 'example', orders, customer),
      t('apostrophe', 'a name with an apostrophe', withQuotes, "Liam O'Brien"),
    ],
    hidden: [
      t('or-true', "the classic ' OR '1'='1", orders, "x' OR '1'='1"),
      t('comment', 'a name followed by a SQL comment', orders, `${customer}' --`),
      t('union', 'a UNION injection', orders, "' UNION SELECT total_cents FROM orders --"),
      t('stacked', 'a second statement', orders, "x'; DROP TABLE orders; --"),
      t('missing', 'a customer with no orders', orders, 'Nobody Here'),
      t('case', 'names match exactly (case-sensitive)', orders, customer.toUpperCase()),
      t('two-quotes', 'another apostrophe name', withQuotes, "D'Arcy Fox"),
      t('many', 'many orders', big, rng.pick(NAMES)),
    ],
  };
}
