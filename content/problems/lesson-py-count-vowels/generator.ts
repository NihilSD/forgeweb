import type { GenContext, Instance, Rng } from '@forge/problem-kit';

export function vowels(s: string): number {
  return [...s.toLowerCase()].filter((c) => 'aeiou'.includes(c)).length;
}

export function phrase(rng: Rng): string {
  return Array.from({ length: rng.int(2, 5) }, () =>
    rng.pick(['Forge', 'Queue', 'rhythm', 'AUDIO', 'sky', 'Banana', 'ocean', 'Python']),
  ).join(' ');
}

export default function generate({ rng }: GenContext): Instance {
  const example = phrase(rng);
  return {
    params: { example: JSON.stringify(example), example_result: vowels(example) },
    data: { example },
  };
}
