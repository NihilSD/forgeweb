/** JSON value → Python literal, for statement examples. */
export function py(value: unknown): string {
  if (value === null) return 'None';
  if (value === true) return 'True';
  if (value === false) return 'False';
  if (Array.isArray(value)) return `[${value.map(py).join(', ')}]`;
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'object')
    return `{${Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${JSON.stringify(k)}: ${py(v)}`)
      .join(', ')}}`;
  return String(value);
}

import type { GenContext, Instance, Rng } from '@forge/problem-kit';

export function longestStreak(days: boolean[]): number {
  let best = 0;
  let current = 0;
  for (const d of days) {
    current = d ? current + 1 : 0;
    best = Math.max(best, current);
  }
  return best;
}

/** Short runs first, then the longest run at the very end (the case the bug misses). */
export function endingWithBest(rng: Rng): boolean[] {
  const days: boolean[] = [];
  for (let i = rng.int(1, 3); i > 0; i--) {
    days.push(...Array<boolean>(rng.int(1, 2)).fill(true), false);
  }
  days.push(...Array<boolean>(rng.int(3, 5)).fill(true));
  return days;
}

export default function generate({ rng }: GenContext): Instance {
  const days = endingWithBest(rng);
  return {
    params: {
      app: rng.pick(['Daily Sketch', 'Run Club', 'Word a Day']),
      example_days: py(days),
      example_result: longestStreak(days),
    },
    data: { days },
  };
}
