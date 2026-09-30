import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import type { Language } from '@forge/shared';
import { build } from 'esbuild';
import { parse as parseYaml } from 'yaml';
import { checkEditorial, parseHints } from './render.js';
import { type Manifest, manifestSchema } from './schema.js';

const EXT_LANG: Record<string, Language> = {
  '.py': 'python',
  '.ts': 'typescript',
  '.js': 'javascript',
  '.sql': 'sql',
};

export interface SolutionFile {
  name: string;
  language: Language;
  code: string;
}

export interface BuiltPackage {
  dir: string;
  manifest: Manifest;
  statement: string;
  hints: string[];
  editorial: string;
  starters: Partial<Record<Language, string>>;
  references: Partial<Record<Language, string>>;
  wrongs: SolutionFile[];
  /** Bundled ESM exporting generate / tests / followups. Server-side only. */
  moduleCode: string;
  /** sha256 over every file in the package: the import is a no-op when unchanged. */
  hash: string;
}

export class PackageError extends Error {}

async function listFiles(dir: string, base = dir): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(full, base)));
    else out.push(relative(base, full));
  }
  return out.sort();
}

async function readSolutions(dir: string): Promise<SolutionFile[]> {
  if (!existsSync(dir)) return [];
  const files = await readdir(dir);
  const out: SolutionFile[] = [];
  for (const name of files.sort()) {
    const language = EXT_LANG[extname(name)];
    if (!language) continue;
    out.push({ name, language, code: await readFile(join(dir, name), 'utf8') });
  }
  return out;
}

async function readRequired(dir: string, name: string): Promise<string> {
  const p = join(dir, name);
  if (!existsSync(p)) throw new PackageError(`${name} is missing`);
  return readFile(p, 'utf8');
}

/** Reads, checks the structure of, and bundles one problem package directory. */
export async function buildPackage(dir: string): Promise<BuiltPackage> {
  const raw = parseYaml(await readRequired(dir, 'problem.yaml')) as unknown;
  const parsed = manifestSchema.safeParse(raw);
  if (!parsed.success) {
    throw new PackageError(
      `problem.yaml: ${parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'} ${i.message}`).join('; ')}`,
    );
  }
  const manifest = parsed.data;
  const dirName = dir.split(/[\\/]/).filter(Boolean).pop();
  if (dirName !== manifest.id)
    throw new PackageError(`folder name "${dirName}" must equal id "${manifest.id}"`);

  const statement = await readRequired(dir, 'statement.md');
  let hints: string[];
  try {
    hints = parseHints(await readRequired(dir, 'hints.md'));
  } catch (err) {
    throw new PackageError((err as Error).message);
  }
  const editorial = await readRequired(dir, 'editorial.md');
  try {
    checkEditorial(editorial);
  } catch (err) {
    throw new PackageError((err as Error).message);
  }

  const starters: Partial<Record<Language, string>> = {};
  for (const s of await readSolutions(join(dir, 'starter'))) starters[s.language] = s.code;
  const references: Partial<Record<Language, string>> = {};
  for (const s of await readSolutions(join(dir, 'reference'))) references[s.language] = s.code;
  const wrongs = await readSolutions(join(dir, 'wrong'));

  for (const lang of manifest.languages) {
    if (!references[lang]) throw new PackageError(`reference solution for ${lang} is missing`);
    if (manifest.format !== 'flag' && !starters[lang])
      throw new PackageError(`starter code for ${lang} is missing`);
  }
  if (manifest.format === 'fix-code' && wrongs.length === 0 && Object.keys(starters).length === 0) {
    throw new PackageError('fix-code problems need a buggy starter');
  }

  const hasTests = existsSync(join(dir, 'tests.ts'));
  const hasFollowups = existsSync(join(dir, 'followups.ts'));
  await readRequired(dir, 'generator.ts');
  if (manifest.format !== 'flag' && !hasTests) throw new PackageError('tests.ts is missing');
  if (manifest.mode !== 'practice' && !hasFollowups) {
    throw new PackageError(
      'followups.ts is required for competitive-enabled problems (mode: competitive | both)',
    );
  }

  const entry = [
    `export { default as generate } from './generator.ts';`,
    hasTests ? `export { default as tests } from './tests.ts';` : '',
    hasFollowups ? `export { default as followups } from './followups.ts';` : '',
  ].join('\n');
  let moduleCode: string;
  try {
    const result = await build({
      stdin: { contents: entry, resolveDir: dir, loader: 'ts', sourcefile: 'entry.ts' },
      bundle: true,
      write: false,
      format: 'esm',
      platform: 'neutral',
      target: 'es2022',
      logLevel: 'silent',
    });
    moduleCode = result.outputFiles[0]!.text;
  } catch (err) {
    throw new PackageError(`bundling failed: ${(err as Error).message}`);
  }

  const hash = createHash('sha256');
  for (const f of await listFiles(dir)) {
    hash
      .update(f)
      .update('\0')
      .update(await readFile(join(dir, f)))
      .update('\0');
  }

  return {
    dir,
    manifest,
    statement,
    hints,
    editorial,
    starters,
    references,
    wrongs,
    moduleCode,
    hash: hash.digest('hex'),
  };
}

/** Every package directory (a folder containing problem.yaml) under `root`. */
export async function findPackages(root: string): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isDirectory() && existsSync(join(root, entry.name, 'problem.yaml')))
      out.push(join(root, entry.name));
  }
  return out.sort();
}
