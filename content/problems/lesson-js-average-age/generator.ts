import type { GenContext, Instance, Rng } from '@forge/problem-kit';

export type Person = { name: string; age: number };
export function avg(ps: Person[]): number {
  return ps.length ? ps.reduce((a, p) => a + p.age, 0) / ps.length : 0;
}
export function people(rng: Rng, n: number): Person[] {
  return Array.from({ length: n }, () => ({ name: rng.word('person'), age: rng.int(16, 90) }));
}

export default function generate({ rng }: GenContext): Instance {
  const example = people(rng, 3);
  return {
    params: { example: JSON.stringify(example), example_result: Number(avg(example).toFixed(4)) },
    data: { example },
  };
}
