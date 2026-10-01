import type { Instance, Rng, TestCase, TestSuite } from '@forge/problem-kit';
import { cheapest, randomRoads, type Road } from './generator.ts';

const t = (
  id: string,
  category: string,
  n: number,
  roads: Road[],
  s: number,
  g: number,
): TestCase => ({
  id,
  category,
  args: [n, roads, s, g],
  expected: cheapest(n, roads, s, g),
});

export default function tests(instance: Instance, { rng }: { rng: Rng }): TestSuite {
  const trip = instance.data as { n: number; roads: Road[]; start: number; goal: number };
  const big = randomRoads(rng, 300, 2000);
  return {
    visible: [
      t('example', 'example', trip.n, trip.roads, trip.start, trip.goal),
      t('backwards', 'a road listed the other way round', 2, [[1, 0, 7]], 0, 1),
    ],
    hidden: [
      t('same', 'start is the goal', 3, [[0, 1, 4]], 2, 2),
      t(
        'unreachable',
        'goal cannot be reached',
        4,
        [
          [0, 1, 3],
          [2, 3, 1],
        ],
        0,
        3,
      ),
      t(
        'detour',
        'more roads but cheaper',
        4,
        [
          [0, 3, 100],
          [1, 0, 10],
          [1, 2, 10],
          [3, 2, 10],
        ],
        0,
        3,
      ),
      t(
        'parallel',
        'two roads between the same towns',
        2,
        [
          [0, 1, 9],
          [1, 0, 4],
        ],
        0,
        1,
      ),
      t('country', 'a large map', 300, big, rng.int(0, 99), rng.int(200, 299)),
    ],
  };
}
