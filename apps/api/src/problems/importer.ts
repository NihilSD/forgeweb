import {
  type BuiltPackage,
  buildPackage,
  findPackages,
  type ValidationReport,
} from '@forge/problem-kit';
import type { Prisma, PrismaClient } from '@forge/db';
import { DIFFICULTY_RATING, TRACKS } from '@forge/shared';

export interface ImportOptions {
  /** Validation results keyed by package id (from the validator). Missing = not validated. */
  reports?: Map<string, ValidationReport>;
  /** Development only: publish drafts that haven't been human-reviewed. */
  publishDrafts?: boolean;
  log?: (line: string) => void;
}

export interface ImportSummary {
  created: string[];
  updated: string[];
  unchanged: string[];
  failed: { id: string; error: string }[];
}

export async function upsertTracks(prisma: PrismaClient) {
  for (const t of TRACKS) {
    await prisma.track.upsert({
      where: { slug: t.slug },
      create: { ...t },
      update: { name: t.name, order: t.order },
    });
  }
}

/**
 * Imports every package under `root`. Idempotent: a package whose hash matches its stored version
 * is left alone. Changing a published version's files requires bumping `version` in problem.yaml.
 */
export async function importProblems(
  prisma: PrismaClient,
  root: string,
  opts: ImportOptions = {},
): Promise<ImportSummary> {
  if (opts.publishDrafts && process.env.NODE_ENV === 'production') {
    throw new Error(
      '--publish-drafts is for development only. Production publishes reviewed problems from Admin.',
    );
  }
  const log = opts.log ?? (() => undefined);
  await upsertTracks(prisma);
  const tracks = new Map((await prisma.track.findMany()).map((t) => [t.slug, t.id]));
  const summary: ImportSummary = { created: [], updated: [], unchanged: [], failed: [] };

  for (const dir of await findPackages(root)) {
    let pkg: BuiltPackage;
    try {
      pkg = await buildPackage(dir);
    } catch (err) {
      summary.failed.push({ id: dir, error: (err as Error).message });
      continue;
    }
    const m = pkg.manifest;
    const report = opts.reports?.get(m.id);
    if (report && !report.ok) {
      summary.failed.push({ id: m.id, error: `invalid: ${report.errors[0]}` });
      continue;
    }
    const existing = await prisma.problem.findUnique({
      where: { slug: m.id },
      include: { versions: { where: { version: m.version } } },
    });
    const sameVersion = existing?.versions[0];
    if (sameVersion && sameVersion.packageHash === pkg.hash) {
      if (opts.publishDrafts && existing.status !== 'published') {
        await prisma.problem.update({
          where: { id: existing.id },
          data: { status: 'published', publishedAt: new Date() },
        });
      }
      summary.unchanged.push(m.id);
      continue;
    }
    if (sameVersion?.publishedAt) {
      summary.failed.push({
        id: m.id,
        error: `version ${m.version} is published and its files changed; bump version in problem.yaml`,
      });
      continue;
    }
    if (existing && m.version < existing.version) {
      summary.failed.push({
        id: m.id,
        error: `version ${m.version} is older than the current version ${existing.version}`,
      });
      continue;
    }

    const versionData = {
      version: m.version,
      packageHash: pkg.hash,
      statement: pkg.statement,
      limits: m.limits,
      manifest: m as unknown as Prisma.InputJsonValue,
      starters: pkg.starters,
      hints: pkg.hints,
      editorial: pkg.editorial,
      references: pkg.references,
      moduleCode: pkg.moduleCode,
      ...(report ? { validationReport: report as unknown as Prisma.InputJsonValue } : {}),
    };
    const problemData = {
      title: m.title,
      trackId: tracks.get(m.track)!,
      difficulty: m.difficulty,
      tags: m.tags,
      formats: [m.format],
      languages: m.languages,
      mode: m.mode,
      listed: m.listed,
      reviewStatus: m.review === 'approved' ? ('approved' as const) : ('needs_review' as const),
      version: m.version,
      searchText: [m.title, m.id.replace(/-/g, ' '), ...m.tags].join(' '),
    };
    const publish = opts.publishDrafts
      ? { status: 'published' as const, publishedAt: new Date() }
      : {};

    await prisma.$transaction(async (tx) => {
      const problem = existing
        ? await tx.problem.update({
            where: { id: existing.id },
            data: { ...problemData, ...publish },
          })
        : await tx.problem.create({
            data: {
              slug: m.id,
              rating: DIFFICULTY_RATING[m.difficulty],
              ...problemData,
              ...publish,
            },
          });
      await tx.problemVersion.upsert({
        where: { problemId_version: { problemId: problem.id, version: m.version } },
        create: {
          problemId: problem.id,
          ...versionData,
          ...(publish.publishedAt ? { publishedAt: publish.publishedAt } : {}),
        },
        update: versionData,
      });
      // Keep the published version's publishedAt when a draft is re-imported.
      if (problem.status === 'published') {
        await tx.problemVersion.updateMany({
          where: { problemId: problem.id, version: m.version, publishedAt: null },
          data: { publishedAt: new Date() },
        });
      }
    });
    (existing ? summary.updated : summary.created).push(m.id);
    log(`${existing ? 'updated' : 'created'} ${m.id} v${m.version}`);
  }
  return summary;
}
