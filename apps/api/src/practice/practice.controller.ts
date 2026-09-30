import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseIntPipe,
  Post,
  Put,
} from '@nestjs/common';
import type { User } from '@forge/db';
import {
  bookmarkListSchema,
  editorialSchema,
  entitlementsSchema,
  hintsSchema,
  masterySchema,
  noteSchema,
  progressSchema,
  recommendationsSchema,
  reviewQueueSchema,
} from '@forge/shared';
import { z } from 'zod';
import { ApiError } from '../common/api-error.js';
import { CurrentUser } from '../common/request-context.js';
import { ResponseSchema } from '../common/response-schema.js';
import { ZodPipe } from '../common/zod.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';
import { ContentService } from '../problems/content.service.js';
import { RateLimit } from '../rate-limit/rate-limit.guard.js';
import { PracticeService } from './practice.service.js';

const slugSchema = z.string().regex(/^[a-z0-9-]{1,80}$/);
const ok = z.object({ ok: z.literal(true) });

@Controller()
export class PracticeController {
  constructor(
    @Inject(PracticeService) private readonly practice: PracticeService,
    @Inject(ContentService) private readonly content: ContentService,
    @Inject(EntitlementsService) private readonly entitlements: EntitlementsService,
  ) {}

  private async problem(slug: string) {
    const p = await this.content.getPublished(slug);
    return { ...p, hintTexts: p.current.hints as string[] };
  }

  @Get('problems/:slug/hints')
  @ResponseSchema(hintsSchema)
  async hints(@Param('slug', new ZodPipe(slugSchema)) slug: string, @CurrentUser() user: User) {
    return this.practice.hints(user, await this.problem(slug));
  }

  @Post('problems/:slug/hints/:level/reveal')
  @HttpCode(200)
  @RateLimit({ bucket: 'hint', by: 'user', limit: 60, windowSec: 3600 })
  @ResponseSchema(hintsSchema)
  async reveal(
    @Param('slug', new ZodPipe(slugSchema)) slug: string,
    @Param('level', new ParseIntPipe()) level: number,
    @CurrentUser() user: User,
  ) {
    if (level < 1 || level > 4) throw ApiError.notFound('Hint');
    return this.practice.revealHint(user, await this.problem(slug), level);
  }

  @Get('problems/:slug/editorial')
  @ResponseSchema(editorialSchema)
  async editorial(@Param('slug', new ZodPipe(slugSchema)) slug: string, @CurrentUser() user: User) {
    const p = await this.problem(slug);
    return this.practice.editorial(user, p, p.current.editorial);
  }

  @Get('problems/:slug/progress')
  @ResponseSchema(progressSchema)
  async progress(@Param('slug', new ZodPipe(slugSchema)) slug: string, @CurrentUser() user: User) {
    const p = await this.content.getPublished(slug);
    return this.practice.progress(user, p.id);
  }

  @Post('problems/:slug/give-up')
  @HttpCode(200)
  @ResponseSchema(progressSchema)
  async giveUp(@Param('slug', new ZodPipe(slugSchema)) slug: string, @CurrentUser() user: User) {
    const p = await this.content.getPublished(slug);
    await this.practice.giveUp(user, p);
    return this.practice.progress(user, p.id);
  }

  @Put('problems/:slug/bookmark')
  @ResponseSchema(ok)
  async bookmark(@Param('slug', new ZodPipe(slugSchema)) slug: string, @CurrentUser() user: User) {
    const p = await this.content.getPublished(slug);
    await this.practice.setBookmark(user.id, p.id, true);
    return { ok: true as const };
  }

  @Delete('problems/:slug/bookmark')
  @ResponseSchema(ok)
  async unbookmark(
    @Param('slug', new ZodPipe(slugSchema)) slug: string,
    @CurrentUser() user: User,
  ) {
    const p = await this.content.getPublished(slug);
    await this.practice.setBookmark(user.id, p.id, false);
    return { ok: true as const };
  }

  @Put('problems/:slug/note')
  @ResponseSchema(ok)
  async note(
    @Param('slug', new ZodPipe(slugSchema)) slug: string,
    @Body(new ZodPipe(noteSchema)) body: { text: string },
    @CurrentUser() user: User,
  ) {
    const p = await this.content.getPublished(slug);
    await this.practice.setNote(user.id, p.id, body.text);
    return { ok: true as const };
  }

  @Get('me/mastery')
  @ResponseSchema(masterySchema)
  mastery(@CurrentUser() user: User) {
    return this.practice.mastery(user.id);
  }

  @Get('me/review')
  @ResponseSchema(reviewQueueSchema)
  review(@CurrentUser() user: User) {
    return this.practice.reviewQueue(user.id);
  }

  @Get('me/recommendations')
  @ResponseSchema(recommendationsSchema)
  recommendations(@CurrentUser() user: User) {
    return this.practice.recommendations(user);
  }

  @Get('me/bookmarks')
  @ResponseSchema(bookmarkListSchema)
  bookmarks(@CurrentUser() user: User) {
    return this.practice.bookmarks(user.id);
  }

  @Get('me/entitlements')
  @ResponseSchema(entitlementsSchema)
  entitlementsView(@CurrentUser() user: User) {
    return this.entitlements.get(user.id);
  }
}
