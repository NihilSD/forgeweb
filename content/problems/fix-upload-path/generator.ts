import type { GenContext, Instance } from '@forge/problem-kit';

export const BASE = '/srv/uploads';

export function resolve(name: string): string | null {
  if (!name || name.includes('\0') || name.startsWith('/')) return null;
  const parts = BASE.split('/').filter(Boolean);
  for (const part of name.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  const path = `/${parts.join('/')}`;
  return path.startsWith(`${BASE}/`) ? path : null;
}

export default function generate({ rng }: GenContext): Instance {
  const folder = rng.pick(['photos', 'invoices', 'avatars', 'reports']);
  const file = `${rng.word('product')}-${rng.int(1, 99)}.${rng.pick(['png', 'pdf', 'txt'])}`;
  const ok = `${folder}/./${file}`;
  const attack = `${folder}/${'../'.repeat(rng.int(2, 4))}etc/passwd`;
  return {
    params: {
      app: rng.pick(['PhotoShelf', 'DocDrop', 'Filebox']),
      example_ok: JSON.stringify(ok),
      example_ok_result: JSON.stringify(resolve(ok)),
      example_attack: JSON.stringify(attack),
    },
    data: { ok, attack, folder, file },
  };
}
