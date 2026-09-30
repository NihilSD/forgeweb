import type { GenContext, Instance, Rng } from '@forge/problem-kit';

export function lengths(s: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const w of s.split(' ').filter(Boolean)) out[w] = w.length;
  return out;
}

export function sentence(rng: Rng): string {
  return rng
    .sample(['forge', 'code', 'test', 'array', 'map', 'queue', 'loop', 'type'], rng.int(2, 5))
    .join(' ');
}

export default function generate({ rng }: GenContext): Instance {
  const example = sentence(rng);
  return {
    params: { example: JSON.stringify(example), example_result: JSON.stringify(lengths(example)) },
    data: { example },
  };
}
