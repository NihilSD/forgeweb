import type { GenContext, Instance, Rng } from '@forge/problem-kit';

export function firstIndex(ids: number[], target: number): number {
  return ids.indexOf(target);
}

export function sortedIds(rng: Rng, n: number, maxRepeat = 4): number[] {
  const out: number[] = [];
  let id = rng.int(100, 500);
  while (out.length < n) {
    id += rng.int(1, 9);
    for (let r = rng.int(1, maxRepeat); r > 0 && out.length < n; r--) out.push(id);
  }
  return out;
}

export default function generate({ rng }: GenContext): Instance {
  // The target repeats so that a binary search hits a later copy first.
  const before = sortedIds(rng, rng.int(2, 4), 1);
  const target = before[before.length - 1]! + rng.int(1, 5);
  const after = sortedIds(rng, rng.int(1, 3), 1).map((x) => x + target);
  const ids = [...before, ...Array<number>(rng.int(3, 5)).fill(target), ...after];
  return {
    params: {
      system: rng.pick(['HelpDesk', 'TicketBox', 'Issue Vault']),
      example_ids: JSON.stringify(ids),
      example_target: target,
      example_result: firstIndex(ids, target),
    },
    data: { ids, target },
  };
}
