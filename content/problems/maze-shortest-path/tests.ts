import type { Instance, Rng, TestSuite } from '@forge/problem-kit';
import { bfs, makeMaze } from './generator.ts';

export default function tests(instance: Instance, { rng }: { rng: Rng }): TestSuite {
  const t = (id: string, category: string, m: string[]) => ({
    id,
    category,
    args: [m],
    expected: bfs(m),
  });
  const { example } = instance.data as { example: string[] };
  return {
    visible: [t('example', 'example', example)],
    hidden: [
      t('unreachable', 'exit walled off', ['S.#', '###', '#.E']),
      t('adjacent', 'exit next to start', ['SE']),
      t('open', 'open room (many paths)', makeMaze(rng, 8, 9, 0)),
      t('random', 'random maze', makeMaze(rng, 30, 30, 0.25)),
      t('large', 'large maze (performance)', makeMaze(rng, 300, 300, 0.2)),
    ],
  };
}
