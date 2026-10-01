import type { GenContext, Instance, Rng } from '@forge/problem-kit';

export type Entry = [string, number];

export function topPlayers(scores: Entry[], k: number): string[] {
  const totals = new Map<string, number>();
  for (const [name, points] of scores) totals.set(name, (totals.get(name) ?? 0) + points);
  return [...totals]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, k)
    .map(([n]) => n);
}

const NAMES = [
  'ada',
  'bo',
  'cleo',
  'dev',
  'emi',
  'finn',
  'gus',
  'hana',
  'ivo',
  'juno',
  'kai',
  'lea',
];

/** Several entries per player, and a tie for the top places. */
export function board(rng: Rng, players: number): Entry[] {
  const names = rng.sample(NAMES, players);
  const entries: Entry[] = [];
  const tie = rng.int(30, 60);
  names.forEach((name, i) => {
    const target = i < 2 ? tie : rng.int(5, tie - 1);
    let left = target;
    const games = rng.int(2, 3);
    for (let g = 1; g < games; g++) {
      const p = rng.int(0, left);
      entries.push([name, p]);
      left -= p;
    }
    entries.push([name, left]);
  });
  return rng.shuffle(entries);
}

export default function generate({ rng }: GenContext): Instance {
  const scores = board(rng, 4);
  const k = 3;
  return {
    params: {
      game: rng.pick(['Star Courier', 'Puzzle Peaks', 'Turbo Snail']),
      example_scores: JSON.stringify(scores),
      example_k: k,
      example_result: JSON.stringify(topPlayers(scores, k)),
    },
    data: { scores, k },
  };
}
