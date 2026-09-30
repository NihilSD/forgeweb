import type { GenContext, Instance, Rng } from '@forge/problem-kit';

export function average(ratings: number[]): number {
  const rated = ratings.filter((r) => r !== 0);
  return rated.length ? rated.reduce((a, b) => a + b, 0) / rated.length : 0;
}

export function randomRatings(rng: Rng, n: number, zeroChance = 0.2): number[] {
  return Array.from({ length: n }, () => (rng.bool(zeroChance) ? 0 : rng.int(1, 5)));
}

export default function generate({ rng }: GenContext): Instance {
  // The example starts with a high rating followed by low ones, so the bug is visible right away.
  const example = [5, ...Array.from({ length: rng.int(2, 4) }, () => rng.int(1, 2)), 0];
  return {
    params: {
      product: `${rng.pick(['Aurora', 'Nimbus', 'Vega', 'Orbit', 'Juniper'])} ${rng.word('product')}`,
      example_ratings: JSON.stringify(example),
      example_result: Number(average(example).toFixed(4)),
    },
    data: { example },
  };
}
