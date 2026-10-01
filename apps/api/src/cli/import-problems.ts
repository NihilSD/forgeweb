/**
 * Imports content/problems into the database.
 *
 *   pnpm problems:import [--no-validate] [--publish-drafts] [--seeds 50] [--root content/problems]
 *
 * Validation uses the development executor, so it is skipped in production: there, CI has already
 * validated every package before it could merge.
 */
import '../config/load-dotenv.js';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createPrismaClient } from '@forge/db';
import { findPackages, type ValidationReport, validatePackage } from '@forge/problem-kit';
import { importCourses } from '../courses/course-importer.js';
import { importPlacement } from '../engagement/placement.service.js';
import { importProblems } from '../problems/importer.js';

const { values } = parseArgs({
  options: {
    root: { type: 'string', default: resolve(import.meta.dirname, '../../../../content/problems') },
    validate: { type: 'boolean', default: process.env.NODE_ENV !== 'production' },
    'no-validate': { type: 'boolean', default: false },
    'publish-drafts': { type: 'boolean', default: false },
    seeds: { type: 'string', default: '20' },
  },
});

const prisma = createPrismaClient();
try {
  const reports = new Map<string, ValidationReport>();
  if (values.validate && !values['no-validate']) {
    const { DevExecutor } = await import('@forge/problem-kit/dev-executor');
    const executor = new DevExecutor();
    for (const dir of await findPackages(values.root)) {
      const report = await validatePackage(dir, { executor, seeds: Number(values.seeds) });
      reports.set(report.id, report);
      console.info(
        `${report.ok ? '✔' : '✘'} validated ${report.id}${report.ok ? '' : `: ${report.errors[0]}`}`,
      );
    }
  }
  const summary = await importProblems(prisma, values.root, {
    reports,
    publishDrafts: values['publish-drafts'],
    log: (l) => console.info(l),
  });
  console.info(
    `created ${summary.created.length}, updated ${summary.updated.length}, unchanged ${summary.unchanged.length}, failed ${summary.failed.length}`,
  );
  for (const f of summary.failed) console.error(`  ✘ ${f.id}: ${f.error}`);
  const courses = await importCourses(prisma, resolve(values.root, '../courses'), {
    publishDrafts: values['publish-drafts'],
  });
  console.info(`courses: ${courses.join(', ') || 'none'}`);
  const quiz = await importPlacement(prisma, resolve(values.root, '../placement/quiz.yaml'), {
    publishDrafts: values['publish-drafts'],
  });
  console.info(`placement questions: ${quiz}`);
  process.exitCode = summary.failed.length ? 1 : 0;
} finally {
  await prisma.$disconnect();
}
