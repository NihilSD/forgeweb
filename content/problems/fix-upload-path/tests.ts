import type { Instance, TestCase, TestSuite } from '@forge/problem-kit';
import { resolve } from './generator.ts';

const t = (id: string, category: string, name: string): TestCase => ({
  id,
  category,
  args: [name],
  expected: resolve(name),
});

export default function tests(instance: Instance): TestSuite {
  const { ok, attack, folder, file } = instance.data as {
    ok: string;
    attack: string;
    folder: string;
    file: string;
  };
  return {
    visible: [t('example-ok', 'example', ok), t('example-attack', 'example', attack)],
    hidden: [
      t('plain', 'a plain file name', file),
      t('parent', 'a single ../', `../${file}`),
      t('deep-escape', 'escaping from a subfolder', `${folder}/../../../etc/shadow`),
      t('inside-dotdot', '.. that stays inside', `${folder}/old/../${file}`),
      t('dotted-name', 'dots inside a file name', `${folder}/my..notes.txt`),
      t('base-itself', 'the upload folder itself', '.'),
      t('back-to-base', 'a path that resolves to the folder', `${folder}/..`),
      t('sibling', 'a sibling folder with a similar name', '../uploads-archive/secret.txt'),
      t('round-trip', 'leaving and re-entering the folder', `../uploads/${file}`),
      t('double-slash', 'empty segments', `${folder}//${file}`),
      t('absolute', 'an absolute path', '/etc/passwd'),
      t('nul', 'a NUL byte', `${file}\0.png`),
      t('empty', 'an empty name', ''),
    ],
  };
}
