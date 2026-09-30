import type { Instance, Rng, TestSuite } from '@forge/problem-kit';
import { lengths, sentence } from './generator.ts';

export default function tests(instance: Instance, { rng }: { rng: Rng }): TestSuite {
  const t = (id: string, category: string, s: string) => ({
    id,
    category,
    args: [s],
    expected: lengths(s),
  });
  const { example } = instance.data as { example: string };
  return {
    visible: [t('example', 'example', example)],
    hidden: [
      t('empty', 'empty sentence', ''),
      t('one', 'one word', 'forge'),
      t('repeat', 'repeated word', 'go go now'),
      t('random', 'random', sentence(rng)),
    ],
  };
}
