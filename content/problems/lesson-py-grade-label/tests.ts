import type { Instance, Rng, TestSuite } from '@forge/problem-kit';
import { label } from './generator.ts';

export default function tests(instance: Instance, { rng }: { rng: Rng }): TestSuite {
  const t = (score: number) => ({
    id: `s${score}`,
    category: `score ${score}`,
    args: [score],
    expected: label(score),
  });
  const { example } = instance.data as { example: number };
  const edges = [0, 49, 50, 74, 75, 89, 90, 100];
  return {
    visible: [{ ...t(example), id: 'example', category: 'example' }],
    hidden: [...edges, rng.int(0, 100)]
      .map(t)
      .filter((x, i, a) => a.findIndex((y) => y.id === x.id) === i),
  };
}
