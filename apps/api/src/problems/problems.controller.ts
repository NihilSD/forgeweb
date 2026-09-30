import { Controller, Get, Inject, Param, Query, Req } from '@nestjs/common';
import { Prisma } from '@forge/db';
import {
  type ProblemDetail,
  problemDetailSchema,
  type ProblemListQuery,
  problemListQuerySchema,
  problemListSchema,
  type ProblemSummary,
  trackListSchema,
} from '@forge/shared';
import { z } from 'zod';
import { type ForgeRequest, Public } from '../common/request-context.js';
import { ResponseSchema } from '../common/response-schema.js';
import { ZodPipe } from '../common/zod.js';
import { PrismaService } from '../infra/prisma.service.js';
import { RateClassOf } from '../rate-limit/rate-limit.guard.js';
import { ContentService } from './content.service.js';
import { SolvedService } from './solved.service.js';

const slugSchema = z.string().regex(/^[a-z0-9-]{1,80}$/);

@Public()
@Controller()
export class ProblemsController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ContentService) private readonly content: ContentService,
    @Inject(SolvedService) private readonly solved: SolvedService,
  ) {}

  @Get('tracks')
  @ResponseSchema(trackListSchema)
  async tracks() {
    const tracks = await this.prisma.client.track.findMany({
      orderBy: { order: 'asc' },
      include: {
        _count: {
          select: {
            problems: {
              where: { status: 'published', listed: true, mode: { not: 'competitive' } },
            },
          },
        },
      },
    });
    return {
      items: tracks.map((t) => ({
        slug: t.slug,
        name: t.name,
        order: t.order,
        problemCount: t._count.problems,
      })),
    };
  }

  @Get('problems')
  @RateClassOf('search')
  @ResponseSchema(problemListSchema)
  async list(
    @Query(new ZodPipe(problemListQuerySchema)) q: ProblemListQuery,
    @Req() req: ForgeRequest,
  ) {
    const userId = req.auth?.user.id ?? null;
    const solvedIds = userId && q.status ? await this.solved.solvedProblemIds(userId) : null;

    let searchIds: string[] | null = null;
    if (q.q) {
      // Parameterised full-text query; user input is never concatenated into SQL.
      const rows = await this.prisma.client.$queryRaw<{ id: string }[]>(
        Prisma.sql`SELECT id FROM "Problem" WHERE search @@ websearch_to_tsquery('simple', ${q.q}) OR title ILIKE ${`%${q.q.replace(/[%_\\]/g, '\\$&')}%`} LIMIT 500`,
      );
      searchIds = rows.map((r) => r.id);
    }

    const idFilter: Prisma.StringFilter<'Problem'> = {};
    if (searchIds) idFilter.in = searchIds;
    if (solvedIds && q.status === 'solved')
      idFilter.in = searchIds ? searchIds.filter((id) => solvedIds.has(id)) : [...solvedIds];
    if (solvedIds && q.status === 'unsolved') idFilter.notIn = [...solvedIds];

    const where: Prisma.ProblemWhereInput = {
      status: 'published',
      listed: true,
      mode: { not: 'competitive' },
      ...(q.track ? { track: { slug: q.track } } : {}),
      ...(q.difficulty ? { difficulty: q.difficulty } : {}),
      ...(q.tag ? { tags: { has: q.tag } } : {}),
      ...(Object.keys(idFilter).length ? { id: idFilter } : {}),
    };
    const rows = await this.prisma.client.problem.findMany({
      where,
      include: { track: true },
      orderBy: [{ rating: 'asc' }, { slug: 'asc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { slug: q.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, q.limit);
    const solvedSet = userId
      ? (solvedIds ?? (await this.solved.solvedProblemIds(userId)))
      : new Set<string>();
    const items: ProblemSummary[] = page.map((p) => ({
      slug: p.slug,
      title: p.title,
      track: p.track.slug,
      difficulty: p.difficulty,
      rating: p.rating,
      tags: p.tags,
      formats: p.formats,
      languages: p.languages,
      mode: p.mode,
      solved: solvedSet.has(p.id),
    }));
    return { items, nextCursor: rows.length > q.limit ? page[page.length - 1]!.slug : null };
  }

  @Get('problems/:slug')
  @ResponseSchema(problemDetailSchema)
  async detail(
    @Param('slug', new ZodPipe(slugSchema)) slug: string,
    @Req() req: ForgeRequest,
  ): Promise<ProblemDetail> {
    const userId = req.auth?.user.id ?? null;
    const p = await this.content.getPublished(slug);
    const manifest = this.content.manifest(p.current);
    const gen = await this.content.instance(p.current, this.content.practiceSeed(userId, p.id));
    const solved = userId ? (await this.solved.solvedProblemIds(userId)).has(p.id) : false;
    return {
      slug: p.slug,
      title: p.title,
      track: p.track.slug,
      difficulty: p.difficulty,
      rating: p.rating,
      tags: p.tags,
      formats: p.formats,
      languages: p.languages,
      mode: p.mode,
      solved,
      version: p.version,
      format: manifest.format,
      statement: this.content.renderStatement(p.current, gen),
      limits: this.content.limits(p.current),
      entry: manifest.entry ?? null,
      starters: this.content.starters(p.current, gen),
      visibleTests: this.content.visibleTests(gen.suite),
      hiddenTestCount: gen.suite.hidden.length,
      hintCount: (p.current.hints as string[]).length,
      files: Object.keys(gen.instance.files ?? {}),
      verifiedMinutes: manifest.verifiedMinutes,
    };
  }
}
