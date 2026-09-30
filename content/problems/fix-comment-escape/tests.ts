import type { Instance, TestCase, TestSuite } from '@forge/problem-kit';
import { render } from './generator.ts';

const t = (id: string, category: string, author: string, text: string): TestCase => ({
  id,
  category,
  args: [author, text],
  expected: render(author, text),
});

export default function tests(instance: Instance): TestSuite {
  const { author, text } = instance.data as { author: string; text: string };
  return {
    visible: [
      t('example', 'example', author, text),
      t('script-author', 'markup in the display name', '<img src=x onerror=alert(1)>', 'hello'),
    ],
    hidden: [
      t('plain', 'plain text', 'sam', 'Nice post!'),
      t('script-text', 'markup in the comment', 'sam', '<script>steal()</script>'),
      t('attribute-break', 'breaking out of the title attribute', '" onmouseover="alert(1)', 'hi'),
      t('single-quote', 'single quotes', "O'Neil", "it's fine"),
      t(
        'ampersand-first',
        'ampersands are escaped once',
        'Tom & Jerry',
        '&lt; is already an entity',
      ),
      t('empty', 'empty comment', 'ana', ''),
      t('unicode', 'non-ASCII text is kept', 'Zoë', 'Ça va? ✓'),
    ],
  };
}
