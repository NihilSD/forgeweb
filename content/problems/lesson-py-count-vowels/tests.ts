import type { Instance, Rng, TestSuite } from '@forge/problem-kit';
import { phrase, vowels } from './generator.ts';

export default function tests(instance: Instance, { rng }: { rng: Rng }): TestSuite {
  const t = (id: string, category: string, s: string) => ({
    id,
    category,
    args: [s],
    expected: vowels(s),
  });
  const { example } = instance.data as { example: string };
  return {
    visible: [t('example', 'example', example)],
    hidden: [
      t('empty', 'empty text', ''),
      t('upper', 'upper-case vowels', 'AEIOU xyz'),
      t('none', 'no vowels', 'rhythm'),
      t('random', 'random', phrase(rng)),
    ],
  };
}
