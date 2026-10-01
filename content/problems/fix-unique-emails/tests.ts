import type { Instance, Rng, TestCase, TestSuite } from '@forge/problem-kit';
import { address, firstSeen, shout } from './generator.ts';

const t = (id: string, category: string, emails: string[]): TestCase => ({
  id,
  category,
  args: [emails],
  expected: firstSeen(emails),
});

export default function tests(instance: Instance, { rng }: { rng: Rng }): TestSuite {
  const { emails } = instance.data as { emails: string[] };
  const many = Array.from({ length: 3000 }, () => address(rng)).map((e) =>
    rng.bool(0.3) ? shout(rng, e) : e,
  );
  return {
    visible: [
      t('example', 'example', emails),
      t('twice', 'the same address twice', ['a@x.io', 'a@x.io']),
    ],
    hidden: [
      t('empty', 'no sign-ups', []),
      t('case', 'same address, different capitals', [
        'Bo@Example.com',
        'bo@example.com',
        'BO@EXAMPLE.COM',
      ]),
      t('order', 'first spelling and order are kept', ['z@x.io', 'A@x.io', 'a@X.io', 'm@x.io']),
      t('unique', 'no repeats', ['a@x.io', 'b@x.io']),
      t('many', 'a long list', many),
    ],
  };
}
