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

export function firstSeen(emails: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of emails) {
    const key = e.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(e);
    }
  }
  return out;
}

const NAMES = ['ana', 'bo', 'chen', 'dara', 'eli', 'farah', 'gus', 'hiro', 'ines', 'jon'];
const DOMAINS = ['example.com', 'example.org', 'mail.example'];

export function address(rng: Rng): string {
  return `${rng.pick(NAMES)}.${rng.int(1, 99)}@${rng.pick(DOMAINS)}`;
}

export function shout(rng: Rng, email: string): string {
  return [...email].map((c) => (rng.bool(0.4) ? c.toUpperCase() : c)).join('');
}

export default function generate({ rng }: GenContext): Instance {
  const a = address(rng);
  const b = address(rng);
  const c = address(rng);
  const emails = [a, b, shout(rng, a).toUpperCase(), c, b];
  return {
    params: {
      club: rng.pick(['Hill Runners', 'Chess Corner', 'Garden Circle']),
      example_emails: py(emails),
      example_result: py(firstSeen(emails)),
    },
    data: { emails },
  };
}
