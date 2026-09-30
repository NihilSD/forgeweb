import type { GenContext, Instance } from '@forge/problem-kit';
import { ascii, base64 } from './bytes.ts';

export default function generate({ rng, flag }: GenContext): Instance {
  const key = `${rng.pick(['kestrel', 'nimbus', 'harbor', 'quartz'])}-${rng.hex(4)}-backup`;
  const source = [
    '"""Encrypts team notes before they are copied to shared storage."""',
    'import base64',
    'import sys',
    '',
    '# TODO: move this somewhere safer before we share the repo.',
    `BACKUP_KEY = "${key}"`,
    '',
    '',
    'def protect(data: bytes) -> bytes:',
    '    key = BACKUP_KEY.encode()',
    '    mixed = bytes(b ^ key[i % len(key)] for i, b in enumerate(data))',
    '    return base64.b64encode(mixed)',
    '',
    '',
    "if __name__ == '__main__':",
    '    src, dst = sys.argv[1], sys.argv[2]',
    "    with open(src, 'rb') as f, open(dst, 'wb') as out:",
    '        out.write(protect(f.read()))',
  ].join('\n');
  const notes = [
    `Team notes, week ${rng.int(1, 52)}`,
    `- ${rng.word('person')} is on call; rotate the pager on Friday.`,
    `- The staging database moves to a new host next sprint.`,
    `- Vault recovery phrase: ${flag ?? 'FORGE{flag-shown-only-to-signed-in-users}'}`,
  ].join('\n');
  const keyBytes = ascii(key);
  const mixed = ascii(notes).map((b, i) => b ^ keyBytes[i % keyBytes.length]!);
  return {
    params: { org: rng.pick(['Northwind Labs', 'Blue Owl Security', 'Kestrel Systems']) },
    files: { 'backup_notes.py': `${source}\n`, 'notes.bak': `${base64(mixed)}\n` },
    data: { key },
  };
}
