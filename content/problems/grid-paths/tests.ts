import type { Instance, Rng, TestSuite } from '@forge/problem-kit';
import { makeGrid, paths } from './generator.ts';

export default function tests(instance: Instance, { rng }: { rng: Rng }): TestSuite {
  const t = (id: string, category: string, g: string[]) => ({
    id,
    category,
    args: [g],
    expected: paths(g),
  });
  const { example } = instance.data as { example: string[] };
  return {
    visible: [t('example', 'example', example)],
    hidden: [
      t('blocked-start', 'blocked start', ['#.', '..']),
      t('single', 'one cell', ['.']),
      t('open', 'open grid (modulo)', makeGrid(rng, 40, 40, 0)),
      t('random', 'random beds', makeGrid(rng, 12, 15, 0.2)),
      t('large', 'large grid (performance)', makeGrid(rng, 60, 60, 0.05)),
    ],
  };
}
