import type { GenContext, Instance } from '@forge/problem-kit';

export function label(score: number): string {
  return score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 50 ? 'C' : 'F';
}

export default function generate({ rng }: GenContext): Instance {
  const example = rng.int(0, 100);
  return { params: { example, example_result: JSON.stringify(label(example)) }, data: { example } };
}
