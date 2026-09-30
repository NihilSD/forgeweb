import type { GenContext, Instance, Rng } from '@forge/problem-kit';

export type Order = [number, string, number];

export function lookup(orders: Order[], customer: string): number[] {
  return orders
    .filter((o) => o[1] === customer)
    .map((o) => o[0])
    .sort((a, b) => a - b);
}

export function randomOrders(rng: Rng, names: string[], n: number): Order[] {
  return Array.from(
    { length: n },
    (_, i) => [i + 1, rng.pick(names), rng.int(500, 90_000)] as Order,
  );
}

export const NAMES = [
  'Ada Park',
  "Liam O'Brien",
  'Mia Chen',
  'Noah Diaz',
  "D'Arcy Fox",
  'Zoe Hill',
];

export default function generate({ rng }: GenContext): Instance {
  const orders = randomOrders(rng, NAMES, rng.int(8, 14));
  const customer = orders[0]![1] === "Liam O'Brien" ? 'Ada Park' : orders[0]![1];
  return {
    params: {
      shop: rng.pick(['Pine & Pixel', 'Harbor Tea Co.', 'Orbit Outdoor']),
      example_customer: JSON.stringify(customer),
      example_result: JSON.stringify(lookup(orders, customer)),
      example_attack: "`x' OR '1'='1`",
    },
    data: { orders, customer },
  };
}
