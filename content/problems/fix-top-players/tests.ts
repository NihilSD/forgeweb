import type { Instance, Rng, TestCase, TestSuite } from '@forge/problem-kit';
import { board, type Entry, topPlayers } from './generator.ts';

const t = (id: string, category: string, scores: Entry[], k: number): TestCase => ({
  id,
  category,
  args: [scores, k],
  expected: topPlayers(scores, k),
});

export default function tests(instance: Instance, { rng }: { rng: Rng }): TestSuite {
  const { scores, k } = instance.data as { scores: Entry[]; k: number };
  return {
    visible: [
      t('example', 'example', scores, k),
      t(
        'sum',
        'points from several games add up',
        [
          ['bo', 5],
          ['ana', 8],
          ['bo', 6],
        ],
        1,
      ),
    ],
    hidden: [
      t(
        'tie',
        'tied totals',
        [
          ['zed', 10],
          ['amy', 10],
          ['kim', 3],
        ],
        2,
      ),
      t('fewer', 'fewer players than k', [['ana', 1]], 5),
      t('empty', 'no scores', [], 3),
      t(
        'zero',
        'zero points',
        [
          ['ana', 0],
          ['bo', 0],
          ['bo', 0],
        ],
        2,
      ),
      t(
        'order',
        'a late big score',
        [
          ['ana', 9],
          ['bo', 1],
          ['bo', 1],
          ['bo', 20],
        ],
        2,
      ),
      t('season', 'a whole season', board(rng, 12).concat(board(rng, 12)), rng.int(3, 8)),
    ],
  };
}
