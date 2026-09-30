import type { GenContext, Instance } from '@forge/problem-kit';

function shift(text: string, k: number): string {
  return text.replace(/[a-z]/gi, (ch) => {
    const base = ch <= 'Z' ? 65 : 97;
    return String.fromCharCode(((ch.charCodeAt(0) - base + k) % 26) + base);
  });
}

export default function generate({ rng, flag }: GenContext): Instance {
  const k = rng.int(3, 23);
  const place = rng.pick([
    'north stairwell',
    'server room B',
    'loading dock',
    'rooftop garden',
    'basement lab',
  ]);
  const time = `${rng.int(10, 22)}:${rng.pick(['00', '15', '30', '45'])}`;
  const message = [
    `Status update from ${rng.word('person')}.`,
    `The meeting moved to the ${place} at ${time}.`,
    `Use this access code at the door: ${flag ?? 'FORGE{flag-shown-only-to-signed-in-users}'}`,
    'Burn after reading.',
  ].join('\n');
  return {
    params: { org: rng.pick(['Northwind Labs', 'Blue Owl Security', 'Kestrel Systems']) },
    files: { 'intercept.txt': `${shift(message, k)}\n` },
    data: { k },
  };
}
