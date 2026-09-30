import type { GenContext, Instance, Rng } from '@forge/problem-kit';

export interface Customer {
  id: number;
  name: string;
  city: string;
}
export interface Order {
  id: number;
  customerId: number;
  cents: number;
}
export interface Dataset {
  customers: Customer[];
  orders: Order[];
}

const FIRST = [
  'Ada',
  'Bela',
  'Cora',
  'Dan',
  'Eva',
  'Filip',
  'Gia',
  'Hugo',
  'Ines',
  'Jan',
  'Kira',
  'Luca',
  'Mara',
  'Noah',
  'Olga',
  'Pia',
  'Radu',
  'Sara',
  'Tudor',
  'Uma',
  'Vlad',
  'Wren',
  'Yara',
  'Zeno',
];
const LAST = [
  'Pop',
  'Ionescu',
  'Novak',
  'Silva',
  'Berg',
  'Moreau',
  'Rossi',
  'Kowal',
  'Horvat',
  'Petrov',
];
export const CITIES = ['Cluj', 'Lisbon', 'Oslo', 'Porto', 'Riga', 'Sofia', 'Tallinn', 'Vienna'];

export function money(cents: number) {
  return (cents / 100).toFixed(2);
}

/** Expected rows, computed independently of SQL. */
export function expectedRows(d: Dataset, city: string, minCents: number): [string, string][] {
  const totals = d.customers
    .filter((c) => c.city === city)
    .map((c) => ({
      name: c.name,
      cents: d.orders.filter((o) => o.customerId === c.id).reduce((a, o) => a + o.cents, 0),
    }));
  return totals
    .filter((t) => t.cents >= minCents)
    .sort((a, b) => b.cents - a.cents || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((t) => [t.name, money(t.cents)]);
}

/**
 * Builds data that catches the usual mistakes: a customer whose orders are each small but add up
 * over the minimum (WHERE vs HAVING), one exactly at the minimum, a tie on total (name order), a
 * big spender in another city (missing city filter) and a customer with no orders.
 */
export function makeDataset(rng: Rng, city: string, minCents: number, extra: number): Dataset {
  const names = rng.sample(
    FIRST.flatMap((f) => LAST.map((l) => `${f} ${l}`)),
    8 + extra,
  );
  const other = CITIES.filter((c) => c !== city);
  const customers: Customer[] = names.map((name, i) => ({
    id: i + 1,
    name,
    city: i < 6 || rng.bool() ? city : rng.pick(other),
  }));
  customers[5]!.city = rng.pick(other);
  const orders: Order[] = [];
  let oid = 1;
  const add = (customerId: number, cents: number) => orders.push({ id: oid++, customerId, cents });
  const small = Math.floor(minCents / 3);
  add(1, small);
  add(1, small);
  add(1, minCents - 2 * small + rng.int(1, 5000)); // many small orders, total over the minimum
  add(2, minCents); // exactly the minimum
  const tie = minCents + rng.int(1000, 90_000);
  add(3, tie);
  add(4, tie - 5000);
  add(4, 5000); // same total as customer 3
  add(5, rng.int(1, minCents - 1)); // below the minimum
  add(6, minCents * 3); // other city
  for (const c of customers.slice(8)) {
    for (let k = rng.int(0, 3); k > 0; k--) add(c.id, rng.int(500, minCents));
  }
  // customer 7 has no orders
  return { customers: rng.shuffle(customers).sort((a, b) => a.id - b.id), orders };
}

export function setupSql(d: Dataset): string {
  const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
  const lines = [
    'CREATE TABLE customers (id INT PRIMARY KEY, name TEXT NOT NULL, city TEXT NOT NULL);',
    'CREATE TABLE orders (id INT PRIMARY KEY, customer_id INT NOT NULL REFERENCES customers(id), amount NUMERIC(10, 2) NOT NULL);',
  ];
  if (d.customers.length) {
    lines.push(
      `INSERT INTO customers VALUES ${d.customers.map((c) => `(${c.id}, ${q(c.name)}, ${q(c.city)})`).join(', ')};`,
    );
  }
  if (d.orders.length) {
    lines.push(
      `INSERT INTO orders VALUES ${d.orders.map((o) => `(${o.id}, ${o.customerId}, ${money(o.cents)})`).join(', ')};`,
    );
  }
  return lines.join('\n');
}

export default function generate({ rng }: GenContext): Instance {
  const city = rng.pick(CITIES);
  const minCents = rng.int(20, 90) * 1000;
  const sample = makeDataset(rng, city, minCents, 0);
  const first = expectedRows(sample, city, minCents)[0]!;
  return {
    params: {
      shop: rng.pick(['Paper & Pine', 'Lumen Books', 'Harbor Coffee', 'Tessel Games']),
      city,
      min_total: money(minCents),
      example_name: first[0],
      example_total: first[1],
    },
    data: { city, minCents, sample },
  };
}
