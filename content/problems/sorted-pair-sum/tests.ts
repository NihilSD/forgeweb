import type { Instance, Rng, TestSuite } from '@forge/problem-kit';
import { type Case, makeCase } from './generator.ts';

export default function tests(instance: Instance, { rng }: { rng: Rng }): TestSuite {
  const t = (id: string, category: string, c: Case) => ({
    id,
    category,
    args: [c.weights, c.target],
    expected: c.answer,
  });
  const { example } = instance.data as { example: Case };
  return {
    visible: [t('example', 'example', example)],
    hidden: [
      t('two', 'only two parcels', makeCase(rng, 2)),
      t('medium', 'medium list', makeCase(rng, 500)),
      t('large', 'large list (performance)', makeCase(rng, 100_000)),
    ],
  };
}
