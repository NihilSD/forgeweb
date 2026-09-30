import type { Instance, Rng, TestSuite } from '@forge/problem-kit';
import { fb } from './generator.ts';

export default function tests(instance: Instance, { rng }: { rng: Rng }): TestSuite {
  const t = (id: string, category: string, n: number) => ({
    id,
    category,
    args: [n],
    expected: fb(n),
  });
  const { example } = instance.data as { example: number };
  return {
    visible: [t('example', 'example', example)],
    hidden: [
      t('zero', 'n = 0', 0),
      t('fifteen', 'reaches 15', 15),
      t('random', 'random', rng.int(20, 60)),
    ],
  };
}
