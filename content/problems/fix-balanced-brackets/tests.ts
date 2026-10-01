import type { Instance, Rng, TestCase, TestSuite } from '@forge/problem-kit';
import { isBalanced, snippet } from './generator.ts';

const t = (id: string, category: string, code: string): TestCase => ({
  id,
  category,
  args: [code],
  expected: isBalanced(code),
});

export default function tests(instance: Instance, { rng }: { rng: Rng }): TestSuite {
  const { code } = instance.data as { code: string };
  const deep = snippet(rng, 400);
  return {
    visible: [t('example', 'example', code), t('balanced', 'a balanced snippet', snippet(rng, 3))],
    hidden: [
      t('empty', 'empty snippet', ''),
      t('open', 'brackets left open', '(('),
      t('crossed', 'crossed brackets', '([)]'),
      t('close-first', 'closing before opening', ')('),
      t('wrong-kind', 'wrong kind of closing bracket', '{ x ]'),
      t('text', 'no brackets at all', 'let x = 1;'),
      t('deep', 'deep nesting', deep),
      t('deep-open', 'deep nesting left open', `${deep}{`),
    ],
  };
}
