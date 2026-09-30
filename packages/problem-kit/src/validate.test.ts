import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DevExecutor } from './exec/dev-executor.js';
import { validatePackage } from './validate.js';

const CONTENT = resolve(import.meta.dirname, '../../../content/problems');
const executor = new DevExecutor();
let work: string;

beforeAll(async () => {
  work = await mkdtemp(join(tmpdir(), 'forge-validate-'));
});
afterAll(async () => {
  await rm(work, { recursive: true, force: true });
});

/** Copies a real package into a temp dir (named after its id) and applies a mutation. */
async function mutated(id: string, mutate: (dir: string) => Promise<void>) {
  const dir = join(work, `${Math.random().toString(36).slice(2)}`, id);
  await cp(join(CONTENT, id), dir, { recursive: true });
  await mutate(dir);
  return dir;
}

async function edit(file: string, from: string | RegExp, to: string) {
  const text = await readFile(file, 'utf8');
  const next = text.replace(from, to);
  if (next === text) throw new Error(`mutation did not apply to ${file}`);
  await writeFile(file, next);
}

const SEEDS = 12;

describe('validator', () => {
  it('accepts a valid package', async () => {
    const report = await validatePackage(join(CONTENT, 'fix-average-rating'), {
      executor,
      seeds: SEEDS,
    });
    expect(report.errors).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it('rejects a reference solution that fails', async () => {
    const dir = await mutated('fix-average-rating', (d) =>
      edit(join(d, 'reference/solution.py'), 'range(len(ratings))', 'range(1, len(ratings))'),
    );
    const report = await validatePackage(dir, { executor, seeds: SEEDS });
    expect(report.ok).toBe(false);
    expect(report.errors.join('\n')).toMatch(/reference \(python\) fails/);
  });

  it('rejects a known-wrong solution that the tests accept', async () => {
    const dir = await mutated('fix-average-rating', (d) =>
      writeFile(
        join(d, 'wrong/actually-right.py'),
        'def average_rating(r):\n    x=[v for v in r if v]\n    return sum(x)/len(x) if x else 0\n',
      ),
    );
    const report = await validatePackage(dir, { executor, seeds: SEEDS });
    expect(report.errors.join('\n')).toMatch(/wrong\/actually-right\.py is accepted/);
  });

  it('rejects a starter that passes', async () => {
    const dir = await mutated('fix-average-rating', (d) =>
      edit(join(d, 'starter/solution.js'), 'let i = 1;', 'let i = 0;'),
    );
    const report = await validatePackage(dir, { executor, seeds: SEEDS });
    expect(report.errors.join('\n')).toMatch(/starter \(javascript\) passes/);
  });

  it('rejects a non-deterministic generator', async () => {
    const dir = await mutated('fix-average-rating', (d) =>
      edit(
        join(d, 'generator.ts'),
        'const example = [5,',
        'const example = [5, Math.floor(Math.random() * 1e9),',
      ),
    );
    const report = await validatePackage(dir, { executor, seeds: SEEDS });
    expect(report.errors.join('\n')).toMatch(/not deterministic/);
  });

  it('rejects instances that do not differ between seeds', async () => {
    const dir = await mutated('fix-average-rating', (d) =>
      edit(
        join(d, 'generator.ts'),
        /params: \{[\s\S]*?\n {4}\},\n {4}data: \{ example \},/,
        "params: { product: 'Same lamp', example_ratings: '[5,1,0]', example_result: 2 },\n    data: { example: [5, 1, 0] },",
      ),
    );
    const report = await validatePackage(dir, { executor, seeds: SEEDS });
    expect(report.errors.join('\n')).toMatch(/barely differ/);
  });

  it('rejects unresolved placeholders', async () => {
    const dir = await mutated('fix-average-rating', (d) =>
      edit(join(d, 'statement.md'), 'The product page', 'The {{missing_value}} page'),
    );
    const report = await validatePackage(dir, { executor, seeds: SEEDS });
    expect(report.errors.join('\n')).toMatch(/\{\{missing_value\}\}/);
  });

  it('rejects hints without exactly four levels', async () => {
    const dir = await mutated('fix-average-rating', (d) =>
      edit(join(d, 'hints.md'), /## 4\. Solution[\s\S]*$/, ''),
    );
    const report = await validatePackage(dir, { executor, seeds: SEEDS });
    expect(report.errors.join('\n')).toMatch(/exactly 4 sections/);
  });

  it('rejects an editorial with missing sections', async () => {
    const dir = await mutated('fix-average-rating', (d) =>
      edit(join(d, 'editorial.md'), '## Complexity', '## Notes'),
    );
    const report = await validatePackage(dir, { executor, seeds: SEEDS });
    expect(report.errors.join('\n')).toMatch(/missing sections: complexity/);
  });

  it('rejects tags outside the allowed list', async () => {
    const dir = await mutated('fix-average-rating', (d) =>
      edit(join(d, 'problem.yaml'), 'tags: [off-by-one, arrays]', 'tags: [off-by-one, blockchain]'),
    );
    const report = await validatePackage(dir, { executor, seeds: SEEDS });
    expect(report.errors.join('\n')).toMatch(/problem\.yaml: tags/);
  });

  it('requires follow-ups for competitive-enabled problems', async () => {
    const dir = await mutated('fix-average-rating', (d) =>
      edit(join(d, 'problem.yaml'), 'mode: practice', 'mode: both'),
    );
    const report = await validatePackage(dir, { executor, seeds: SEEDS });
    expect(report.errors.join('\n')).toMatch(/followups\.ts is required/);
  });

  it('checks the flag solver recovers each user flag', async () => {
    const ok = await validatePackage(join(CONTENT, 'caesar-intercept'), { executor, seeds: SEEDS });
    expect(ok.errors).toEqual([]);
    const dir = await mutated('caesar-intercept', (d) =>
      edit(
        join(d, 'generator.ts'),
        "${flag ?? 'FORGE{flag-shown-only-to-signed-in-users}'}",
        'FORGE{000000000000000000000000}',
      ),
    );
    const bad = await validatePackage(dir, { executor, seeds: SEEDS });
    expect(bad.errors.join('\n')).toMatch(/did not recover the flag/);
  });
});
