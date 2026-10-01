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

export function wordCounts(text: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const raw of text.split(/\s+/)) {
    const word = raw.replace(/^[.,!?;:"]+|[.,!?;:"]+$/g, '').toLowerCase();
    if (word) counts[word] = (counts[word] ?? 0) + 1;
  }
  return counts;
}

const NOUNS = ['delivery', 'support', 'price', 'quality', 'app', 'order', 'team', 'service'];
const ADJ = ['great', 'slow', 'friendly', 'fair', 'quick', 'helpful'];

export function comment(rng: Rng): string {
  const noun = rng.pick(NOUNS);
  const adj = rng.pick(ADJ);
  const other = rng.pick(NOUNS.filter((n) => n !== noun));
  return `The ${noun} was ${adj}! ${adj[0]!.toUpperCase()}${adj.slice(1)} ${other}, and the ${noun} arrived "on time".`;
}

export default function generate({ rng }: GenContext): Instance {
  const text = comment(rng);
  return {
    params: {
      company: rng.pick(['Harbor Tea Co.', 'Pine & Pixel', 'Orbit Outdoor']),
      example_text: py(text),
      example_result: py(wordCounts(text)),
    },
    data: { text },
  };
}
