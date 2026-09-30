import type { GenContext, Instance } from '@forge/problem-kit';
import { ascii, base64 } from './bytes.ts';

export const HEADER = 'MEMO/v2\n';

export default function generate({ rng, flag }: GenContext): Instance {
  const key = Array.from({ length: rng.int(4, 8) }, () => rng.int(1, 255));
  const memo = [
    HEADER.trimEnd(),
    `To: ${rng.word('person')}`,
    `Subject: ${rng.pick(['Door codes', 'Server room access', 'Weekend on-call', 'Badge reset'])}`,
    '',
    `The new code for the ${rng.pick(['lab', 'archive', 'loading bay', 'rooftop'])} is below.`,
    `Code: ${flag ?? 'FORGE{flag-shown-only-to-signed-in-users}'}`,
    'Please delete this memo once read.',
  ].join('\n');
  const plain = ascii(memo);
  const cipher = plain.map((b, i) => b ^ key[i % key.length]!);
  return {
    params: {
      org: rng.pick(['Northwind Labs', 'Blue Owl Security', 'Kestrel Systems']),
      header: 'MEMO/v2\\n',
    },
    files: { 'memo.bin': { base64: base64(cipher) } },
    data: { key },
  };
}
