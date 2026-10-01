import type { Instance, Rng, TestCase, TestSuite } from '@forge/problem-kit';
import { type Booking, merge, randomBookings } from './generator.ts';

const t = (id: string, category: string, bookings: Booking[]): TestCase => ({
  id,
  category,
  args: [bookings],
  expected: merge(bookings),
});

export default function tests(instance: Instance, { rng }: { rng: Rng }): TestSuite {
  const { bookings } = instance.data as { bookings: Booking[] };
  return {
    visible: [
      t('example', 'example', bookings),
      t('reversed', 'bookings made in reverse order', [
        [300, 360],
        [100, 200],
        [150, 320],
      ]),
    ],
    hidden: [
      t('empty', 'no bookings', []),
      t('touching', 'one booking ends as the next starts', [
        [60, 90],
        [30, 60],
      ]),
      t('inside', 'a booking inside another', [
        [100, 400],
        [150, 200],
      ]),
      t('separate', 'nothing overlaps', [
        [500, 530],
        [100, 130],
      ]),
      t('chain', 'a chain of overlaps out of order', [
        [40, 60],
        [0, 20],
        [10, 50],
        [70, 80],
      ]),
      t('day', 'a busy day', randomBookings(rng, 200)),
    ],
  };
}
