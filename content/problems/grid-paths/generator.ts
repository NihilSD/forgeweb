import type { GenContext, Instance, Rng } from '@forge/problem-kit';

const MOD = 1_000_000_007n;
export function paths(grid: string[]): number {
  const h = grid.length;
  const w = grid[0]?.length ?? 0;
  if (!h || !w) return 0;
  const dp: bigint[] = new Array(w).fill(0n);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (grid[r]![c] === '#') dp[c] = 0n;
      else if (r === 0 && c === 0) dp[c] = 1n;
      else dp[c] = (dp[c]! + (c > 0 ? dp[c - 1]! : 0n)) % MOD;
    }
  }
  return Number(dp[w - 1]!);
}
export function makeGrid(rng: Rng, h: number, w: number, density: number): string[] {
  return Array.from({ length: h }, (_, r) =>
    Array.from({ length: w }, (_, c) =>
      (r === 0 && c === 0) || (r === h - 1 && c === w - 1) ? '.' : rng.bool(density) ? '#' : '.',
    ).join(''),
  );
}

export default function generate({ rng }: GenContext): Instance {
  const example = makeGrid(rng, 3, 4, 0.15);
  return {
    params: {
      person: rng.word('person'),
      example: JSON.stringify(example),
      example_result: paths(example),
    },
    data: { example },
  };
}
