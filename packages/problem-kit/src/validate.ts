import type { ExecRequest, Language } from '@forge/shared';
import { canonical } from './compare.js';
import { type BuiltPackage, buildPackage, PackageError } from './build.js';
import type { Executor } from './exec/types.js';
import { flagFor } from './flag.js';
import { grade } from './grade.js';
import { type GeneratedInstance, generateInstance, loadModule } from './load.js';
import { placeholders, render } from './render.js';
import { fileText } from './files.js';
import { checkFollowUps } from './followups.js';
import type { PackageModule } from './schema.js';

export interface ValidationReport {
  id: string;
  dir: string;
  ok: boolean;
  errors: string[];
  warnings: string[];
  seeds: number;
  hash?: string;
  checkedAt: string;
}

export interface ValidateOptions {
  executor: Executor;
  seeds?: number;
}

const VALIDATOR_FLAG_SECRET = 'forge-validator-flag-secret';
const VALIDATE_CONCURRENCY = Number(process.env.VALIDATE_CONCURRENCY ?? 6);
const SEEDS_PER_PROCESS = 5;

/** Spec 5 validator rules. Never throws for a bad package: problems go in `errors`. */
export async function validatePackage(
  dir: string,
  opts: ValidateOptions,
): Promise<ValidationReport> {
  const seeds = opts.seeds ?? 50;
  const report: ValidationReport = {
    id: dir.split(/[\\/]/).filter(Boolean).pop() ?? dir,
    dir,
    ok: false,
    errors: [],
    warnings: [],
    seeds,
    checkedAt: new Date().toISOString(),
  };

  let pkg: BuiltPackage;
  try {
    pkg = await buildPackage(dir);
  } catch (err) {
    report.errors.push(
      err instanceof PackageError ? err.message : `unexpected: ${(err as Error).message}`,
    );
    return report;
  }
  report.hash = pkg.hash;
  report.id = pkg.manifest.id;
  if (pkg.manifest.review !== 'approved')
    report.warnings.push('review: needs-review (cannot be published in production)');

  let mod: PackageModule;
  try {
    mod = await loadModule(pkg.moduleCode, pkg.hash);
  } catch (err) {
    report.errors.push(`module failed to load: ${(err as Error).message}`);
    return report;
  }

  // ---- generator determinism and variety
  const instances: GeneratedInstance[] = [];
  try {
    for (let seed = 1; seed <= seeds; seed++) {
      const flag =
        pkg.manifest.format === 'flag'
          ? flagFor(VALIDATOR_FLAG_SECRET, `user-${seed}`, pkg.manifest.id)
          : undefined;
      const a = generateInstance(mod, seed, flag);
      const b = generateInstance(mod, seed, flag);
      if (canonical(a) !== canonical(b)) {
        report.errors.push(
          `generator is not deterministic (seed ${seed} produced two different instances)`,
        );
        return report;
      }
      instances.push(a);
    }
  } catch (err) {
    report.errors.push(`generator or tests threw: ${(err as Error).message}`);
    return report;
  }
  const distinct = new Set(instances.map((i) => canonical(i.instance))).size;
  const minDistinct = Math.min(10, Math.ceil(seeds / 2));
  if (distinct < minDistinct) {
    report.errors.push(
      `instances barely differ between seeds (${distinct} distinct in ${seeds}; need ${minDistinct})`,
    );
  }

  // ---- placeholders
  const templates: [string, string][] = [
    ['statement.md', pkg.statement],
    ...Object.entries(pkg.starters).map(([l, c]) => [`starter (${l})`, c] as [string, string]),
    ...Object.entries(pkg.references).map(([l, c]) => [`reference (${l})`, c] as [string, string]),
  ];
  for (const [name, tpl] of templates) {
    for (const p of placeholders(tpl)) {
      const missing = instances.filter((i) => !(p in i.instance.params)).length;
      if (missing)
        report.errors.push(
          `${name}: placeholder {{${p}}} is not provided by the generator (${missing} seeds)`,
        );
    }
  }

  // ---- tests present
  if (pkg.manifest.format !== 'flag') {
    for (const i of instances) {
      if (i.suite.visible.length === 0 || i.suite.hidden.length === 0) {
        report.errors.push(`seed ${i.seed}: needs at least one visible and one hidden test`);
        break;
      }
      const ids = [...i.suite.visible, ...i.suite.hidden].map((t) => t.id);
      if (new Set(ids).size !== ids.length) {
        report.errors.push(`seed ${i.seed}: test ids must be unique`);
        break;
      }
    }
  }
  if (report.errors.length) return report;

  if (pkg.manifest.format === 'flag') {
    await validateFlag(pkg, instances, opts.executor, report);
  } else {
    await validateCode(pkg, instances, opts.executor, report);
  }
  if (mod.followups) validateFollowUps(pkg, mod, instances, report);
  report.ok = report.errors.length === 0;
  return report;
}

type Outcome = { seed: number; passed: boolean; detail: string };

/**
 * Runs one solution against every seed. Seeds whose rendered code is identical share a process,
 * which keeps validation fast when solutions don't use placeholders.
 */
async function runAcrossSeeds(
  pkg: BuiltPackage,
  language: Language,
  template: string,
  instances: GeneratedInstance[],
  executor: Executor,
): Promise<Outcome[]> {
  const groups = new Map<string, GeneratedInstance[]>();
  for (const i of instances) {
    const code = render(template, i.instance.params);
    groups.set(code, [...(groups.get(code) ?? []), i]);
  }
  const outcomes: Outcome[] = [];
  // Chunk large groups: one process per <= SEEDS_PER_PROCESS seeds keeps requests small and lets
  // slow (e.g. timing-out) wrong solutions run in parallel. Groups are independent.
  const entries: [string, GeneratedInstance[]][] = [];
  for (const [code, group] of groups) {
    for (let k = 0; k < group.length; k += SEEDS_PER_PROCESS)
      entries.push([code, group.slice(k, k + SEEDS_PER_PROCESS)]);
  }
  let next = 0;
  const worker = async () => {
    while (next < entries.length) {
      const [code, group] = entries[next++]!;
      const tests = group.flatMap((i) =>
        [...i.suite.visible, ...i.suite.hidden].map((t) => ({
          id: `${i.seed}:${t.id}`,
          ...(t.args ? { args: t.args } : {}),
          ...(t.setupSql ? { setupSql: t.setupSql } : {}),
        })),
      );
      const request: ExecRequest = {
        language,
        code,
        ...(pkg.manifest.entry?.[language] ? { entry: pkg.manifest.entry[language] } : {}),
        tests,
        limits: pkg.manifest.limits,
      };
      const result = await executor.run(request);
      for (const i of group) {
        const prefix = `${i.seed}:`;
        const suite = {
          visible: i.suite.visible.map((t) => ({ ...t, id: prefix + t.id })),
          hidden: i.suite.hidden.map((t) => ({ ...t, id: prefix + t.id })),
        };
        const g = grade(
          suite,
          { ...result, tests: result.tests.filter((t) => t.id.startsWith(prefix)) },
          pkg.manifest.comparator,
        );
        const failed = g.tests.find((t) => !t.passed);
        outcomes.push({
          seed: i.seed,
          passed: g.verdict === 'accepted',
          detail: failed
            ? `${g.verdict} on "${failed.category}"${g.message ? `: ${g.message}` : ''}${failed.error ? `: ${failed.error.split('\n').pop()}` : ''}`
            : g.verdict,
        });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(VALIDATE_CONCURRENCY, entries.length) }, worker));
  return outcomes.sort((a, b) => a.seed - b.seed);
}

async function validateCode(
  pkg: BuiltPackage,
  instances: GeneratedInstance[],
  executor: Executor,
  report: ValidationReport,
) {
  for (const lang of pkg.manifest.languages) {
    const ref = await runAcrossSeeds(pkg, lang, pkg.references[lang]!, instances, executor);
    const bad = ref.filter((o) => !o.passed);
    if (bad.length) {
      report.errors.push(
        `reference (${lang}) fails ${bad.length}/${ref.length} seeds; first: seed ${bad[0]!.seed} ${bad[0]!.detail}`,
      );
    }
    const starter = pkg.starters[lang];
    if (starter) {
      const out = await runAcrossSeeds(pkg, lang, starter, instances, executor);
      const passing = out.filter((o) => o.passed);
      if (passing.length) {
        report.errors.push(
          `starter (${lang}) passes all tests on ${passing.length} seeds (e.g. seed ${passing[0]!.seed}); tests must catch it on every instance`,
        );
      }
    }
  }
  for (const wrong of pkg.wrongs) {
    if (!pkg.manifest.languages.includes(wrong.language)) {
      report.warnings.push(`wrong/${wrong.name}: ${wrong.language} is not in languages; skipped`);
      continue;
    }
    const out = await runAcrossSeeds(pkg, wrong.language, wrong.code, instances, executor);
    const passing = out.filter((o) => o.passed);
    if (passing.length) {
      report.errors.push(
        `wrong/${wrong.name} is accepted on ${passing.length}/${out.length} seeds (e.g. seed ${passing[0]!.seed}); add tests that catch it`,
      );
    }
  }
  if (pkg.wrongs.length === 0)
    report.warnings.push('no known-wrong solutions in wrong/ (recommended: at least one)');
}

async function validateFlag(
  pkg: BuiltPackage,
  instances: GeneratedInstance[],
  executor: Executor,
  report: ValidationReport,
) {
  for (const i of instances) {
    const files = i.instance.files ?? {};
    if (Object.keys(files).length === 0) {
      report.errors.push(`seed ${i.seed}: flag generator produced no files`);
      return;
    }
  }
  // The reference solver defines solve(files) -> flag; run it on every seed in one process.
  const request: ExecRequest = {
    language: 'python',
    code: pkg.references.python!,
    entry: 'solve',
    tests: instances.map((i) => ({ id: String(i.seed), args: [i.instance.files] })),
    limits: pkg.manifest.limits,
  };
  const result = await executor.run(request);
  for (const i of instances) {
    const expected = flagFor(VALIDATOR_FLAG_SECRET, `user-${i.seed}`, pkg.manifest.id);
    const r = result.tests.find((t) => t.id === String(i.seed));
    if (!r || r.status !== 'ok' || r.value !== expected) {
      report.errors.push(
        `reference solver did not recover the flag for seed ${i.seed}: ${r?.error ?? result.message ?? JSON.stringify(r?.value)}`,
      );
      return;
    }
    // Only this user's flag may appear in their files.
    const blob = Object.values(i.instance.files ?? {})
      .map(fileText)
      .join('\n');
    const other = flagFor(VALIDATOR_FLAG_SECRET, `user-${i.seed + 1}`, pkg.manifest.id);
    if (blob.includes(other))
      report.errors.push(`seed ${i.seed}: files contain another user's flag`);
  }
}

/** Spec 7.3: every reference solution must be able to answer the follow-ups on a sample of seeds. */
function validateFollowUps(
  pkg: BuiltPackage,
  mod: PackageModule,
  instances: GeneratedInstance[],
  report: ValidationReport,
) {
  const seen = new Set<string>();
  for (const i of instances.slice(0, 10)) {
    for (const [language, template] of Object.entries(pkg.references)) {
      if (!template) continue;
      const code = render(template, i.instance.params);
      let problems: string[];
      try {
        problems = checkFollowUps(mod.followups!(i.instance, code, language), code);
      } catch (err) {
        problems = [`followups.ts threw: ${(err as Error).message}`];
      }
      for (const p of problems) {
        const msg = `follow-ups (${language}): ${p}`;
        if (!seen.has(msg)) report.errors.push(`${msg} (seed ${i.seed})`);
        seen.add(msg);
      }
    }
  }
}
