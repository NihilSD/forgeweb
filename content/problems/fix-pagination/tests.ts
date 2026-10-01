import type { Instance, Rng, TestCase, TestSuite } from '@forge/problem-kit';
import { catalogue, pageItems } from './generator.ts';

const t = (
  id: string,
  category: string,
  items: string[],
  page: number,
  size: number,
): TestCase => ({
  id,
  category,
  args: [items, page, size],
  expected: pageItems(items, page, size),
});

export default function tests(instance: Instance, { rng }: { rng: Rng }): TestSuite {
  const { items, size } = instance.data as { items: string[]; size: number };
  const big = catalogue(rng, rng.int(40, 60));
  return {
    visible: [t('example', 'example', items, 1, size), t('page-2', 'second page', items, 2, size)],
    hidden: [
      t('last-partial', 'last page is not full', items, 3, size),
      t('beyond', 'page after the last one', items, 9, size),
      t('size-1', 'one item per page', ['a', 'b', 'c'], 1, 1),
      t('whole', 'page larger than the list', ['a', 'b', 'c'], 1, 10),
      t('empty', 'no items', [], 1, 5),
      t('big', 'many pages', big, rng.int(2, 6), rng.int(5, 9)),
    ],
  };
}
