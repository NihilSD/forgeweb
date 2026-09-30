import { Controller, Get, HttpCode, Inject, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import type { User } from '@forge/db';
import { type AdminProblem, adminProblemSchema, ErrorCode } from '@forge/shared';
import { z } from 'zod';
import { ApiError } from '../common/api-error.js';
import { clientIp, CurrentUser, type ForgeRequest } from '../common/request-context.js';
import { ResponseSchema } from '../common/response-schema.js';
import { ENV, type Env } from '../config/env.js';
import { AuditService } from '../audit/audit.service.js';
import { Roles } from '../auth/auth.guard.js';
import { PrismaService } from '../infra/prisma.service.js';

type Row = Awaited<ReturnType<AdminProblemsController['load']>>;

@Controller('admin/problems')
@Roles('content_editor', 'superadmin')
export class AdminProblemsController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private load(id?: string) {
    return this.prisma.client.problem.findMany({
      ...(id ? { where: { id } } : {}),
      include: {
        track: true,
        // Only non-sensitive version fields; references and moduleCode stay in the database.
        versions: {
          select: { version: true, validationReport: true },
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ trackId: 'asc' }, { slug: 'asc' }],
      take: 500,
    });
  }

  private toAdmin(p: Row[number]): AdminProblem {
    const report = p.versions[0]?.validationReport as
      { ok: boolean; errors: string[]; warnings: string[]; checkedAt?: string } | null | undefined;
    return {
      id: p.id,
      slug: p.slug,
      title: p.title,
      track: p.track.slug,
      difficulty: p.difficulty,
      status: p.status,
      reviewStatus: p.reviewStatus,
      version: p.version,
      validation: report
        ? {
            ok: report.ok,
            errors: report.errors,
            warnings: report.warnings,
            ...(report.checkedAt ? { checkedAt: report.checkedAt } : {}),
          }
        : null,
      updatedAt: p.updatedAt.toISOString(),
    };
  }

  @Get()
  @ResponseSchema(z.object({ items: z.array(adminProblemSchema) }))
  async list() {
    return { items: (await this.load()).map((p) => this.toAdmin(p)) };
  }

  @Get(':id')
  @ResponseSchema(adminProblemSchema)
  async get(@Param('id', new ParseUUIDPipe()) id: string) {
    const [p] = await this.load(id);
    if (!p) throw ApiError.notFound('Problem');
    return this.toAdmin(p);
  }

  @Post(':id/publish')
  @HttpCode(200)
  @ResponseSchema(adminProblemSchema)
  async publish(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() actor: User,
    @Req() req: ForgeRequest,
  ) {
    const [p] = await this.load(id);
    if (!p) throw ApiError.notFound('Problem');
    // CLAUDE.md: only human-approved content is published.
    if (p.reviewStatus !== 'approved') {
      throw new ApiError(
        ErrorCode.CONFLICT,
        'Only problems marked "review: approved" in problem.yaml can be published.',
      );
    }
    const report = p.versions[0]?.validationReport as { ok?: boolean } | null | undefined;
    if (report && report.ok === false)
      throw new ApiError(ErrorCode.CONFLICT, 'This version failed validation.');
    const now = new Date();
    await this.prisma.client.$transaction([
      this.prisma.client.problem.update({
        where: { id },
        data: { status: 'published', publishedAt: p.publishedAt ?? now },
      }),
      this.prisma.client.problemVersion.updateMany({
        where: { problemId: id, version: p.version, publishedAt: null },
        data: { publishedAt: now },
      }),
    ]);
    await this.audit.log({
      actorId: actor.id,
      action: 'problem.published',
      target: id,
      ip: clientIp(req, this.env),
    });
    return this.get(id);
  }

  @Post(':id/unpublish')
  @HttpCode(200)
  @ResponseSchema(adminProblemSchema)
  async unpublish(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() actor: User,
    @Req() req: ForgeRequest,
  ) {
    const exists = await this.prisma.client.problem.findUnique({ where: { id } });
    if (!exists) throw ApiError.notFound('Problem');
    await this.prisma.client.problem.update({ where: { id }, data: { status: 'draft' } });
    await this.audit.log({
      actorId: actor.id,
      action: 'problem.unpublished',
      target: id,
      ip: clientIp(req, this.env),
    });
    return this.get(id);
  }
}
