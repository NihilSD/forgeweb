import type { GenContext, Instance, Rng } from '@forge/problem-kit';

export function lowerBound(xs: number[], q: number): number {
  let lo = 0;
  let hi = xs.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (xs[mid]! < q) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
export function builds(rng: Rng, n: number): number[] {
  const out: number[] = [];
  let v = rng.int(1, 10);
  for (let i = 0; i < n; i++) {
    v += rng.int(0, 3); // 0 produces duplicates
    out.push(v);
  }
  return out;
}
export function queries(rng: Rng, xs: number[], q: number): number[] {
  const max = (xs[xs.length - 1] ?? 10) + 5;
  return Array.from({ length: q }, () =>
    xs.length && rng.bool(0.5) ? rng.pick(xs) : rng.int(0, max),
  );
}

export default function generate({ rng }: GenContext): Instance {
  const xs = [3, 5, 5, 8, rng.int(9, 12), rng.int(13, 20)];
  const qs = [5, 1, rng.int(21, 30), 8];
  return {
    params: {
      company: rng.pick(['Kestrel CI', 'Blue Owl Builds', 'Harbor Pipelines']),
      example: JSON.stringify(xs),
      example_queries: JSON.stringify(qs),
      example_result: JSON.stringify(qs.map((q) => lowerBound(xs, q))),
    },
    data: { xs, qs },
  };
}
