#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { findPackages } from './build.js';
import { findCourses, validateCourse } from './courses.js';
import { DevExecutor } from './exec/dev-executor.js';
import { validatePackage } from './validate.js';

const USAGE = `forge-problems validate <dir> [--seeds 50] [--only <id>] [--json] [--executor dev|docker]

Validates every problem package under <dir> (or <dir> itself if it contains problem.yaml)
using the development executor (default, content authoring) or the real sandboxes
(--executor docker; needs sandboxes/build.sh). Exits 1 if any package is invalid.`;

function loadRootEnv() {
  const rootEnv = resolve(import.meta.dirname, '../../../.env');
  if (process.env.NODE_ENV !== 'production' && existsSync(rootEnv)) process.loadEnvFile(rootEnv);
}

async function main() {
  loadRootEnv();
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      seeds: { type: 'string', default: '50' },
      only: { type: 'string' },
      json: { type: 'boolean', default: false },
      executor: { type: 'string', default: 'dev' },
    },
  });
  const [command, target] = positionals;
  if (command !== 'validate' || !target) {
    console.error(USAGE);
    process.exit(2);
  }
  const root = resolve(target);
  const dirs = existsSync(join(root, 'problem.yaml')) ? [root] : await findPackages(root);
  const selected = values.only ? dirs.filter((d) => d.endsWith(`/${values.only}`)) : dirs;
  if (selected.length === 0) {
    console.error(`No problem packages found under ${root}`);
    process.exit(1);
  }

  const executor =
    values.executor === 'docker'
      ? new (await import('./exec/docker-executor.js')).DockerExecutor({
          runtime: (process.env.RUNNER_RUNTIME as 'runsc' | 'runc' | undefined) ?? 'runc',
          images: {
            python: process.env.RUNNER_IMAGE_PYTHON ?? 'forge-sandbox-python:latest',
            node: process.env.RUNNER_IMAGE_NODE ?? 'forge-sandbox-node:latest',
            sql: process.env.RUNNER_IMAGE_SQL ?? 'forge-sandbox-postgres-sql:latest',
          },
        })
      : new DevExecutor();
  if (!values.json) console.info(`executor: ${executor.name}`);
  const seeds = Number(values.seeds);
  let failed = 0;
  const reports = [];
  for (const dir of selected) {
    const started = Date.now();
    const report = await validatePackage(dir, { executor, seeds });
    reports.push(report);
    if (!report.ok) failed++;
    if (!values.json) {
      const mark = report.ok ? '✔' : '✘';
      console.info(`${mark} ${report.id} (${Date.now() - started} ms)`);
      for (const e of report.errors) console.info(`    error: ${e}`);
      for (const w of report.warnings) console.info(`    warning: ${w}`);
    }
  }
  // Courses live next to problems (content/courses) and may reference any package by id.
  const coursesRoot = resolve(root, '../courses');
  const ids = new Set((await findPackages(root)).map((d) => d.split(/[\\/]/).pop()!));
  let courseFailures = 0;
  if (!values.only) {
    for (const dir of await findCourses(coursesRoot)) {
      const errors = await validateCourse(dir, ids);
      if (errors.length) courseFailures++;
      if (!values.json) {
        console.info(`${errors.length ? '✘' : '✔'} course ${dir.split(/[\\/]/).pop()}`);
        for (const e of errors) console.info(`    error: ${e}`);
      }
    }
  }
  failed += courseFailures;
  if (values.json) console.info(JSON.stringify(reports, null, 2));
  else
    console.info(
      `\n${selected.length - failed}/${selected.length} packages valid (${seeds} seeds each)`,
    );
  process.exit(failed ? 1 : 0);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
