import type { GenContext, Instance } from '@forge/problem-kit';

export interface TwoSumCase {
  amounts: number[];
  target: number;
  answer: [number, number];
}

/** Builds a list with exactly one pair summing to target. */
export function makeCase(
  rng: GenContext['rng'],
  n: number,
  opts: { equalPair?: boolean } = {},
): TwoSumCase {
  const target = opts.equalPair ? 2 * rng.int(1_000, 500_000) : rng.int(2_000, 1_000_000);
  const a = opts.equalPair ? target / 2 : rng.int(1, target - 1);
  const b = target - a;
  const values = new Set<number>([a, b]);
  const amounts: number[] = [];
  while (amounts.length < n - 2) {
    const v = rng.int(1, 1_000_000);
    // Keep the pair unique: no other value may complete target with anything in the list.
    if (values.has(v) || values.has(target - v) || v * 2 === target) continue;
    values.add(v);
    amounts.push(v);
  }
  const i = rng.int(0, amounts.length);
  amounts.splice(i, 0, a);
  const j = rng.int(i + 1, amounts.length);
  amounts.splice(j, 0, b);
  return { amounts, target, answer: [i, j] };
}

export default function generate({ rng }: GenContext): Instance {
  const example = makeCase(rng, 5);
  const shop = rng.pick(['Northwind', 'Blue Owl', 'Harbor & Co', 'Maple Street']);
  return {
    params: {
      shop,
      item: rng.word('product'),
      target: example.target,
      example_amounts: JSON.stringify(example.amounts),
      example_target: example.target,
      example_result: JSON.stringify(example.answer),
      max_n: 50_000,
    },
    data: { example },
  };
}
