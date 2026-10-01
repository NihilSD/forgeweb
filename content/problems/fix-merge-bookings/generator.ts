import type { GenContext, Instance, Rng } from '@forge/problem-kit';

export type Booking = [number, number];

export function merge(bookings: Booking[]): Booking[] {
  const merged: Booking[] = [];
  for (const [s, e] of [...bookings].sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }
  return merged;
}

export function randomBookings(rng: Rng, n: number): Booking[] {
  return Array.from({ length: n }, () => {
    const s = rng.int(8 * 60, 17 * 60);
    return [s, s + rng.pick([15, 30, 45, 60, 90])] as Booking;
  });
}

/** Out of order, with an overlap that only shows up after sorting. */
export function exampleBookings(rng: Rng): Booking[] {
  const a = rng.int(9, 11) * 60 + rng.pick([0, 15, 30]);
  const late: Booking = [a + rng.int(4, 5) * 60, a + rng.int(6, 7) * 60];
  return rng.bool() ? [[a + 30, a + 90], late, [a, a + 60]] : [late, [a + 30, a + 90], [a, a + 60]];
}

export default function generate({ rng }: GenContext): Instance {
  const bookings = exampleBookings(rng);
  return {
    params: {
      office: rng.pick(['Northwind Labs', 'Kestrel Systems', 'Blue Owl Studio']),
      example_bookings: JSON.stringify(bookings),
      example_result: JSON.stringify(merge(bookings)),
    },
    data: { bookings },
  };
}
