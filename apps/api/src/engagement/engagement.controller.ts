import { Body, Controller, Get, HttpCode, Inject, Post, Query, Req } from '@nestjs/common';
import type { User } from '@forge/db';
import {
  dailySchema,
  ErrorCode,
  placementAnswersSchema,
  placementQuizSchema,
  placementResultSchema,
  progressSummarySchema,
  unsubscribeQuerySchema,
} from '@forge/shared';
import { z } from 'zod';
import { ApiError } from '../common/api-error.js';
import { CurrentUser, type ForgeRequest, Public, SkipCsrf } from '../common/request-context.js';
import { ResponseSchema } from '../common/response-schema.js';
import { ZodPipe } from '../common/zod.js';
import { RateLimit } from '../rate-limit/rate-limit.guard.js';
import { DailyService } from './daily.service.js';
import { DigestService } from './digest.service.js';
import { EngagementService } from './engagement.service.js';
import { PlacementService } from './placement.service.js';

const ok = z.object({ ok: z.literal(true) });

@Controller()
export class EngagementController {
  constructor(
    @Inject(EngagementService) private readonly engagement: EngagementService,
    @Inject(DailyService) private readonly daily: DailyService,
    @Inject(PlacementService) private readonly placement: PlacementService,
    @Inject(DigestService) private readonly digest: DigestService,
  ) {}

  @Get('me/progress')
  @ResponseSchema(progressSummarySchema)
  progress(@CurrentUser() user: User) {
    return this.engagement.progress(user);
  }

  /** Public: anyone can see today's challenges; signed-in users also see what they solved. */
  @Public()
  @Get('daily')
  @ResponseSchema(dailySchema)
  today(@Req() req: ForgeRequest) {
    return this.daily.today(req.auth?.user.id ?? null);
  }

  @Get('placement')
  @ResponseSchema(placementQuizSchema)
  quiz(@CurrentUser() user: User) {
    return this.placement.quiz(user);
  }

  @Post('placement')
  @HttpCode(200)
  @ResponseSchema(placementResultSchema)
  submitPlacement(
    @Body(new ZodPipe(placementAnswersSchema)) body: z.infer<typeof placementAnswersSchema>,
    @CurrentUser() user: User,
  ) {
    return this.placement.submit(user, body.answers);
  }

  @Post('placement/skip')
  @HttpCode(200)
  @ResponseSchema(ok)
  async skipPlacement(@CurrentUser() user: User) {
    await this.placement.skip(user);
    return { ok: true as const };
  }

  /**
   * One-click unsubscribe (RFC 8058): mail clients POST here straight from the List-Unsubscribe
   * header, so there is no session or CSRF token; the signed token is the authorization.
   */
  @Public()
  @SkipCsrf()
  @Post('email/unsubscribe')
  @HttpCode(200)
  @RateLimit({ bucket: 'unsubscribe', by: 'ip', limit: 30, windowSec: 3600 })
  @ResponseSchema(ok)
  async unsubscribe(
    @Query(new ZodPipe(unsubscribeQuerySchema)) query: z.infer<typeof unsubscribeQuerySchema>,
  ) {
    if (!(await this.digest.unsubscribe(query.token)))
      throw new ApiError(ErrorCode.TOKEN_INVALID, 'This unsubscribe link is not valid.');
    return { ok: true as const };
  }
}
