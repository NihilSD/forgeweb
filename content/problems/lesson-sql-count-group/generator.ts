import type { GenContext, Instance, Rng } from '@forge/problem-kit';

export type Product = { id: number; name: string; category: string; price: number; stock: number };
export const CATEGORIES = ['books', 'games', 'tools', 'garden'];

export function products(rng: Rng, n: number): Product[] {
  const names = rng.sample(
    [
      'Atlas',
      'Beacon',
      'Comet',
      'Delta',
      'Ember',
      'Fable',
      'Garnet',
      'Harbor',
      'Iris',
      'Juniper',
      'Kite',
      'Lumen',
      'Maple',
      'Nova',
      'Orbit',
      'Pixel',
    ],
    n,
  );
  return names.map((name, i) => ({
    id: i + 1,
    name,
    category: rng.pick(CATEGORIES),
    price: rng.int(100, 9999),
    stock: rng.int(0, 40),
  }));
}

export function setup(ps: Product[]): string {
  const rows = ps
    .map(
      (p) => `(${p.id}, '${p.name}', '${p.category}', ${(p.price / 100).toFixed(2)}, ${p.stock})`,
    )
    .join(', ');
  return (
    `CREATE TABLE products (id INT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, price NUMERIC(8, 2) NOT NULL, stock INT NOT NULL);` +
    (ps.length ? `\nINSERT INTO products VALUES ${rows};` : '')
  );
}

export function expected(ps: Product[]): [string, string][] {
  const m = new Map<string, number>();
  for (const p of ps) m.set(p.category, (m.get(p.category) ?? 0) + 1);
  return [...m].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([c, n]) => [c, String(n)]);
}

export default function generate({ rng }: GenContext): Instance {
  const sample = products(rng, 8);
  return { params: { first: JSON.stringify(expected(sample)[0] ?? []) }, data: { sample } };
}
