import type { GenContext, Instance } from '@forge/problem-kit';
import { ascii, base64 } from './bytes.ts';

const LAYERS: Record<string, (text: string) => string> = {
  base64: (t) => base64(ascii(t)),
  hex: (t) =>
    ascii(t)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join(''),
  rot13: (t) =>
    t.replace(/[a-z]/gi, (ch) => {
      const base = ch <= 'Z' ? 65 : 97;
      return String.fromCharCode(((ch.charCodeAt(0) - base + 13) % 26) + base);
    }),
  reverse: (t) => [...t].reverse().join(''),
};

export default function generate({ rng, flag }: GenContext): Instance {
  const note = [
    `Delivery for ${rng.word('person')}: ${rng.int(2, 9)} boxes, ${rng.word('product')} parts.`,
    `Leave them at door ${rng.int(1, 40)}.`,
    `Confirmation code: ${flag ?? 'FORGE{flag-shown-only-to-signed-in-users}'}`,
  ].join(' ');
  // All four layers, in a random order. Encoding must end with a printable, single-line string.
  const order = rng.shuffle(Object.keys(LAYERS));
  const wrapped = order.reduce((text, layer) => LAYERS[layer]!(text), note);
  return {
    params: { org: rng.pick(['Northwind Labs', 'Blue Owl Security', 'Kestrel Systems']) },
    files: { 'wrapped.txt': `${wrapped}\n` },
    data: { order },
  };
}
