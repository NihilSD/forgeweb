import type { GenContext, Instance, Rng } from '@forge/problem-kit';

export interface Case {
  weights: number[];
  target: number;
  answer: [number, number];
}

/** Sorted distinct weights with exactly one pair summing to target. */
export function makeCase(rng: Rng, n: number): Case {
  const target = rng.int(n * 4, n * 8);
  const a = rng.int(1, Math.floor((target - 1) / 2));
  const b = target - a;
  const set = new Set<number>([a, b]);
  while (set.size < n) {
    const v = rng.int(1, target * 2);
    if (set.has(v) || set.has(target - v)) continue;
    set.add(v);
  }
  const weights = [...set].sort((x, y) => x - y);
  return { weights, target, answer: [weights.indexOf(a), weights.indexOf(b)] };
}

export default function generate({ rng }: GenContext): Instance {
  const example = makeCase(rng, 6);
  return {
    params: {
      capacity: example.target,
      example: JSON.stringify(example.weights),
      example_target: example.target,
      example_result: JSON.stringify(example.answer),
    },
    data: { example },
  };
}
