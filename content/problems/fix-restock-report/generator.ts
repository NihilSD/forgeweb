import type { GenContext, Instance, Rng } from '@forge/problem-kit';

export type Stock = [string, number][];

export function report(stock: Stock, threshold: number): string[] {
  const totals = new Map<string, number>();
  for (const [name, qty] of stock) totals.set(name, (totals.get(name) ?? 0) + qty);
  return [...totals]
    .filter(([, q]) => q <= threshold)
    .map(([n]) => n)
    .sort();
}

const NAMES = [
  'anchor',
  'bolt',
  'cable',
  'drill',
  'epoxy',
  'fuse',
  'gasket',
  'hinge',
  'insulator',
  'jack',
  'knob',
  'lever',
  'magnet',
  'nozzle',
  'o-ring',
  'pulley',
  'rivet',
  'spring',
  'tape',
  'valve',
];

/**
 * A stock list that exposes both bugs: one product sits exactly at the threshold, and one product
 * is split across warehouses so each entry is low but the total is above the threshold.
 */
export function trickyStock(rng: Rng, threshold: number, extra: number): Stock {
  const names = rng.sample(NAMES, 3 + extra);
  const [exact, split, ...rest] = names as [string, string, ...string[]];
  const firstPart = rng.int(1, threshold - 1);
  const stock: Stock = [
    [exact, threshold],
    [split, firstPart],
    [split, threshold - firstPart + rng.int(1, 5)],
  ];
  for (const n of rest) stock.push([n, rng.int(0, threshold * 3)]);
  return rng.shuffle(stock);
}

export default function generate({ rng }: GenContext): Instance {
  const threshold = rng.int(5, 20);
  const example = trickyStock(rng, threshold, 2);
  return {
    params: {
      company: rng.pick(['Ferro Tools', 'Nordic Supply', 'Danube Parts', 'Kestrel Hardware']),
      example_stock: JSON.stringify(example),
      example_threshold: threshold,
      example_result: JSON.stringify(report(example, threshold)),
    },
    data: { example, threshold },
  };
}
