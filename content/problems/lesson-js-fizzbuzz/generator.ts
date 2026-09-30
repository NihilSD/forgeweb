import type { GenContext, Instance } from '@forge/problem-kit';

export function fb(n: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    const k = i + 1;
    return k % 15 === 0 ? 'FizzBuzz' : k % 3 === 0 ? 'Fizz' : k % 5 === 0 ? 'Buzz' : String(k);
  });
}

export default function generate({ rng }: GenContext): Instance {
  const example = rng.int(5, 16);
  return { params: { example, example_result: JSON.stringify(fb(example)) }, data: { example } };
}
