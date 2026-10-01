import type { Instance, Rng, TestCase, TestSuite } from '@forge/problem-kit';
import { comment, wordCounts } from './generator.ts';

const t = (id: string, category: string, text: string): TestCase => ({
  id,
  category,
  args: [text],
  expected: wordCounts(text),
});

export default function tests(instance: Instance, { rng }: { rng: Rng }): TestSuite {
  const { text } = instance.data as { text: string };
  return {
    visible: [t('example', 'example', text), t('shout', 'all capitals', 'WOW wow Wow')],
    hidden: [
      t('empty', 'empty comment', ''),
      t('punctuation-only', 'pieces that are only punctuation', 'ok ... !! ok'),
      t('spaces', 'extra whitespace', '  fast\\n\\tFAST   fast  '),
      t('quotes', 'quoted words', '"Nice," she said. "nice!"'),
      t('digits', 'numbers count as words', 'Room 101, room 101.'),
      t('long', 'longer comment', Array.from({ length: 30 }, () => comment(rng)).join(' ')),
    ],
  };
}
