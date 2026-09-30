import type { Comparator } from './schema.js';

/** Canonical JSON: object keys sorted, so key order never affects equality. */
export function canonical(value: unknown): string {
  return JSON.stringify(normalize(value));
}

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, normalize(v)]),
    );
  }
  if (typeof value === 'number' && Object.is(value, -0)) return 0;
  return value;
}

function floatEqual(a: unknown, b: unknown, eps = 1e-6): boolean {
  if (typeof a === 'number' && typeof b === 'number') {
    return Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));
  }
  if (Array.isArray(a) && Array.isArray(b))
    return a.length === b.length && a.every((x, i) => floatEqual(x, b[i], eps));
  return canonical(a) === canonical(b);
}

/** SQL cells arrive as strings; numbers are compared numerically ("3.50" equals 3.5). */
function cell(value: unknown): string {
  if (value === null || value === undefined) return '\u0000NULL';
  if (typeof value === 'number') return String(Number(value.toFixed(6)));
  if (typeof value === 'boolean') return value ? 't' : 'f';
  const s = String(value);
  if (/^-?\d+(\.\d+)?$/.test(s)) return String(Number(Number(s).toFixed(6)));
  return s;
}

function rowKey(row: unknown): string {
  return Array.isArray(row) ? JSON.stringify(row.map(cell)) : JSON.stringify(cell(row));
}

export function compare(comparator: Comparator, actual: unknown, expected: unknown): boolean {
  switch (comparator) {
    case 'exact':
      return canonical(actual) === canonical(expected);
    case 'float':
      return floatEqual(actual, expected);
    case 'unordered': {
      if (!Array.isArray(actual) || !Array.isArray(expected)) return false;
      const a = actual.map(canonical).sort();
      const e = expected.map(canonical).sort();
      return a.length === e.length && a.every((x, i) => x === e[i]);
    }
    case 'rows':
    case 'rows-unordered': {
      if (!Array.isArray(actual) || !Array.isArray(expected)) return false;
      const a = actual.map(rowKey);
      const e = expected.map(rowKey);
      if (comparator === 'rows-unordered') {
        a.sort();
        e.sort();
      }
      return a.length === e.length && a.every((x, i) => x === e[i]);
    }
  }
}
