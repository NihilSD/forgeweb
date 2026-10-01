import type { GenContext, Instance } from '@forge/problem-kit';

export function orderTotal(prices: number[], discount: number): number {
  const total = prices.reduce((a, b) => a + b, 0);
  return Math.floor((total * (100 - discount)) / 100);
}

export default function generate({ rng }: GenContext): Instance {
  const prices = Array.from({ length: rng.int(2, 4) }, () => rng.int(150, 4999));
  const discount = rng.pick([10, 15, 20, 25, 30]);
  return {
    params: {
      shop: rng.pick(['Aurora Books', 'Nimbus Toys', 'Vega Garden']),
      example_prices: JSON.stringify(prices),
      example_discount: discount,
      example_result: orderTotal(prices, discount),
    },
    data: { prices, discount },
  };
}
