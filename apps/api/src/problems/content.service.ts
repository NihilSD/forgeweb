import { Inject, Injectable } from '@nestjs/common';
import type { Problem, ProblemVersion } from '@forge/db';
import {
  type GeneratedInstance,
  generateInstance,
  loadModule,
  type Manifest,
  type PackageModule,
  render,
  seedFrom,
  type TestSuite,
} from '@forge/problem-kit';
import type { Language, Limits } from '@forge/shared';
import { ApiError } from '../common/api-error.js';
import { PrismaService } from '../infra/prisma.service.js';

export type LoadedProblem = Problem & { track: { slug: string }; current: ProblemVersion };

/** Server-side access to problem packages: versions, instances and hidden tests. */
@Injectable()
export class ContentService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** A published, practice-visible problem with its current version, or 404. */
  async getPublished(
    slug: string,
    opts: { allowCompetitiveOnly?: boolean } = {},
  ): Promise<LoadedProblem> {
    const problem = await this.prisma.client.problem.findUnique({
      where: { slug },
      include: { track: true },
    });
    if (!problem || problem.status !== 'published') throw ApiError.notFound('Problem');
    // Competitive-only templates never appear in Practice (spec 7.4).
    if (problem.mode === 'competitive' && !opts.allowCompetitiveOnly)
      throw ApiError.notFound('Problem');
    return { ...problem, current: await this.version(problem.id, problem.version) };
  }

  async version(problemId: string, version: number): Promise<ProblemVersion> {
    const v = await this.prisma.client.problemVersion.findUnique({
      where: { problemId_version: { problemId, version } },
    });
    if (!v) throw new ApiError('INTERNAL', 'Problem version is missing.');
    return v;
  }

  manifest(v: ProblemVersion): Manifest {
    return v.manifest as unknown as Manifest;
  }

  limits(v: ProblemVersion): Limits {
    return v.limits as unknown as Limits;
  }

  /** The Practice instance is stable per user and problem, so a reload shows the same data. */
  practiceSeed(userId: string | null, problemId: string): number {
    return seedFrom(`practice:${userId ?? 'anonymous'}:${problemId}`);
  }

  module(v: ProblemVersion): Promise<PackageModule> {
    return loadModule(v.moduleCode, v.packageHash);
  }

  async instance(v: ProblemVersion, seed: number, flag?: string): Promise<GeneratedInstance> {
    const mod = await this.module(v);
    return generateInstance(mod, seed, flag);
  }

  renderStatement(v: ProblemVersion, gen: GeneratedInstance): string {
    return render(v.statement, gen.instance.params);
  }

  starters(v: ProblemVersion, gen: GeneratedInstance): Partial<Record<Language, string>> {
    const templates = v.starters as Partial<Record<Language, string>>;
    return Object.fromEntries(
      Object.entries(templates).map(([lang, tpl]) => [lang, render(tpl!, gen.instance.params)]),
    );
  }

  /** Public part of a suite: visible tests only (hidden ones never leave the server). */
  visibleTests(suite: TestSuite) {
    return suite.visible.map((t) => ({
      id: t.id,
      category: t.category,
      ...(t.args ? { args: t.args } : {}),
      ...(t.setupSql ? { setupSql: t.setupSql } : {}),
      expected: t.expected,
    }));
  }
}
