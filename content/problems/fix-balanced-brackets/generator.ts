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

const PAIRS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

export function isBalanced(code: string): boolean {
  const stack: string[] = [];
  for (const ch of code) {
    if ('([{'.includes(ch)) stack.push(ch);
    else if (ch in PAIRS && stack.pop() !== PAIRS[ch]) return false;
  }
  return stack.length === 0;
}

/** A balanced snippet of nested calls, lists and blocks. */
export function snippet(rng: Rng, depth: number): string {
  if (depth === 0) return rng.pick(['x', 'y + 1', 'n', '"ok"', '42']);
  const inner = snippet(rng, depth - 1);
  return rng.pick([`f(${inner})`, `[${inner}, 0]`, `{ return ${inner}; }`, `(${inner})`]);
}

export default function generate({ rng }: GenContext): Instance {
  const code = `${snippet(rng, rng.int(2, 3))} (`;
  return {
    params: {
      editor: rng.pick(['Quill', 'Lumen', 'Basalt']),
      example_code: py(code),
      example_result: py(isBalanced(code)),
    },
    data: { code },
  };
}
