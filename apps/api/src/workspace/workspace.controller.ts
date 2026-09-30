import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { User } from '@forge/db';
import {
  draftListSchema,
  draftSchema,
  flagFilesSchema,
  flagResultSchema,
  flagSubmitSchema,
  languageSchema,
  saveDraftSchema,
} from '@forge/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { ApiError } from '../common/api-error.js';
import { clientIp, CurrentUser, type ForgeRequest } from '../common/request-context.js';
import { ResponseSchema } from '../common/response-schema.js';
import { ZodPipe } from '../common/zod.js';
import { ENV, type Env } from '../config/env.js';
import { FlagsService } from '../flags/flags.service.js';
import { PrismaService } from '../infra/prisma.service.js';
import { ContentService } from '../problems/content.service.js';
import { RateLimit } from '../rate-limit/rate-limit.guard.js';

const slugSchema = z.string().regex(/^[a-z0-9-]{1,80}$/);
const fileNameSchema = z.string().regex(/^[A-Za-z0-9._-]{1,100}$/);

@Controller('problems/:slug')
export class WorkspaceController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ContentService) private readonly content: ContentService,
    @Inject(FlagsService) private readonly flags: FlagsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  // ------------------------------------------------------------------ drafts

  @Get('drafts')
  @ResponseSchema(draftListSchema)
  async drafts(@Param('slug', new ZodPipe(slugSchema)) slug: string, @CurrentUser() user: User) {
    const problem = await this.content.getPublished(slug);
    const rows = await this.prisma.client.draft.findMany({
      where: { userId: user.id, problemId: problem.id },
    });
    return {
      items: rows.map((d) => ({
        language: languageSchema.parse(d.language),
        code: d.code,
        updatedAt: d.updatedAt.toISOString(),
      })),
    };
  }

  @Put('drafts/:language')
  @RateLimit({ bucket: 'draft', by: 'user', limit: 120, windowSec: 60 })
  @ResponseSchema(draftSchema)
  async saveDraft(
    @Param('slug', new ZodPipe(slugSchema)) slug: string,
    @Param('language', new ZodPipe(languageSchema)) language: z.infer<typeof languageSchema>,
    @Body(new ZodPipe(saveDraftSchema)) body: { code: string },
    @CurrentUser() user: User,
  ) {
    const problem = await this.content.getPublished(slug);
    if (!problem.languages.includes(language)) throw ApiError.notFound('Language');
    const d = await this.prisma.client.draft.upsert({
      where: { userId_problemId_language: { userId: user.id, problemId: problem.id, language } },
      create: { userId: user.id, problemId: problem.id, language, code: body.code },
      update: { code: body.code },
    });
    return { language, code: d.code, updatedAt: d.updatedAt.toISOString() };
  }

  // ------------------------------------------------------------------ flag challenges

  private async flagProblem(slug: string) {
    const problem = await this.content.getPublished(slug);
    if (this.content.manifest(problem.current).format !== 'flag') throw ApiError.notFound('Files');
    return problem;
  }

  @Get('files')
  @ResponseSchema(flagFilesSchema)
  async files(@Param('slug', new ZodPipe(slugSchema)) slug: string, @CurrentUser() user: User) {
    const problem = await this.flagProblem(slug);
    const names = Object.keys(await this.flags.files(user.id, problem));
    return { items: names.map((name) => ({ name, ...this.flags.signUrl(user.id, slug, name) })) };
  }

  /** Signed download. Still requires the same user's session: a leaked URL is useless to others. */
  @Get('files/:name')
  async download(
    @Param('slug', new ZodPipe(slugSchema)) slug: string,
    @Param('name', new ZodPipe(fileNameSchema)) name: string,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    if (typeof sig !== 'string' || !this.flags.verifyUrl(user.id, slug, name, Number(exp), sig)) {
      throw new ApiError(
        'FORBIDDEN',
        'This download link has expired. Reload the page for a new one.',
      );
    }
    const problem = await this.flagProblem(slug);
    const files = await this.flags.files(user.id, problem);
    const content = files[name];
    if (content === undefined) throw ApiError.notFound('File');
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.send(typeof content === 'string' ? content : Buffer.from(content.base64, 'base64'));
  }

  @Post('flag')
  @HttpCode(200)
  @RateLimit({ bucket: 'flag', by: 'user', limit: 20, windowSec: 600 })
  @ResponseSchema(flagResultSchema)
  async submitFlag(
    @Param('slug', new ZodPipe(slugSchema)) slug: string,
    @Body(new ZodPipe(flagSubmitSchema)) body: { flag: string },
    @CurrentUser() user: User,
    @Req() req: ForgeRequest,
  ) {
    const problem = await this.flagProblem(slug);
    return this.flags.submit(user.id, problem, body.flag, clientIp(req, this.env));
  }
}
