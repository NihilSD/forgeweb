import { Controller, Get, Inject, Req } from '@nestjs/common';
import type { User } from '@forge/db';
import { dailySchema, progressSummarySchema } from '@forge/shared';
import { CurrentUser, type ForgeRequest, Public } from '../common/request-context.js';
import { ResponseSchema } from '../common/response-schema.js';
import { DailyService } from './daily.service.js';
import { EngagementService } from './engagement.service.js';

@Controller()
export class EngagementController {
  constructor(
    @Inject(EngagementService) private readonly engagement: EngagementService,
    @Inject(DailyService) private readonly daily: DailyService,
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
}
