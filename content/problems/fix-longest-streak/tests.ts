import type { Instance, Rng, TestCase, TestSuite } from '@forge/problem-kit';
import { endingWithBest, longestStreak } from './generator.ts';

const t = (id: string, category: string, days: boolean[]): TestCase => ({
  id,
  category,
  args: [days],
  expected: longestStreak(days),
});

export default function tests(instance: Instance, { rng }: { rng: Rng }): TestSuite {
  const { days } = instance.data as { days: boolean[] };
  return {
    visible: [t('example', 'example', days), t('all', 'practised every day', [true, true, true])],
    hidden: [
      t('empty', 'no days', []),
      t('none', 'never practised', [false, false]),
      t('middle', 'longest run in the middle', [true, false, true, true, true, false, true]),
      t('last-day', 'one practice day at the end', [false, false, true]),
      t(
        'random',
        'a long history',
        Array.from({ length: 365 }, () => rng.bool(0.7)),
      ),
      t('again', 'longest run at the end of a long history', [
        ...Array.from({ length: 50 }, () => rng.bool(0.5)),
        false,
        ...endingWithBest(rng),
        ...Array<boolean>(40).fill(true),
      ]),
    ],
  };
}
