import type { GenContext, Instance, Rng } from '@forge/problem-kit';

export function nums(rng: Rng, n: number, lo = -50, hi = 50): number[] {
  return Array.from({ length: n }, () => rng.int(lo, hi));
}

export default function generate({ rng }: GenContext): Instance {
  const example = nums(rng, 5);
  return {
    params: { example: JSON.stringify(example), example_result: JSON.stringify(ORACLE(example)) },
    data: { example },
  };
}

export function ORACLE(xs: number[]): number {
  return xs.filter((x) => x > 0).reduce((a, b) => a + b, 0);
}
