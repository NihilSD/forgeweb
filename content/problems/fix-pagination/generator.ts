/** JSON value → Python literal, for statement examples. */
export function py(value: unknown): string {
  if (value === null) return 'None';
  if (value === true) return 'True';
  if (value === false) return 'False';
  if (Array.isArray(value)) return `[${value.map(py).join(', ')}]`;
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'object')
    return `{${Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${JSON.stringify(k)}: ${py(v)}`)
      .join(', ')}}`;
  return String(value);
}

import type { GenContext, Instance, Rng } from '@forge/problem-kit';

export function pageItems<T>(items: T[], page: number, size: number): T[] {
  const start = (page - 1) * size;
  return items.slice(start, start + size);
}

const WORDS = [
  'lamp',
  'kettle',
  'router',
  'chair',
  'mug',
  'drill',
  'tent',
  'scarf',
  'clock',
  'vase',
  'rug',
  'fan',
  'desk',
  'shelf',
  'pillow',
  'blender',
  'speaker',
  'jacket',
];

export function catalogue(rng: Rng, n: number): string[] {
  const adjectives = ['red', 'oak', 'steel', 'wool', 'mini', 'grand', 'smart', 'retro'];
  return Array.from({ length: n }, (_, i) => `${rng.pick(adjectives)}-${rng.pick(WORDS)}-${i + 1}`);
}

export default function generate({ rng }: GenContext): Instance {
  const size = rng.int(2, 4);
  const items = catalogue(rng, size * 2 + rng.int(1, size - 1));
  return {
    params: {
      shop: rng.pick(['Juniper Home', 'Orbit Living', 'Vega Goods']),
      example_items: py(items),
      example_page: 1,
      example_size: size,
      example_result: py(pageItems(items, 1, size)),
    },
    data: { items, size },
  };
}
