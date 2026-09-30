import type { Instance, Rng, TestSuite } from '@forge/problem-kit';
import { avg, people, type Person } from './generator.ts';

export default function tests(instance: Instance, { rng }: { rng: Rng }): TestSuite {
  const t = (id: string, category: string, ps: Person[]) => ({
    id,
    category,
    args: [ps],
    expected: avg(ps),
  });
  const { example } = instance.data as { example: Person[] };
  return {
    visible: [t('example', 'example', example)],
    hidden: [
      t('empty', 'nobody', []),
      t('one', 'one person', people(rng, 1)),
      t('random', 'random', people(rng, 25)),
    ],
  };
}
