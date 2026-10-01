import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import type { User } from '@forge/db';
import {
  appealSchema,
  attemptCodeSchema,
  attemptListSchema,
  attemptSchema,
  eventBatchSchema,
  type EventBatch,
  followUpAnswerSchema,
  followUpViewSchema,
  moderationQueueSchema,
  replaySchema,
  reviewDecisionSchema,
  startAttemptSchema,
  submissionSchema,
  verifiedListSchema,
} from '@forge/shared';
import { z } from 'zod';
import { Roles } from '../auth/auth.guard.js';
import { ENV, type Env } from '../config/env.js';
import {
  clientIp,
  CurrentUser,
  type ForgeRequest,
  RequireVerifiedEmail,
} from '../common/request-context.js';
import { ResponseSchema } from '../common/response-schema.js';
import { ZodPipe } from '../common/zod.js';
import { RateClassOf } from '../rate-limit/rate-limit.guard.js';
import { SubmissionsService } from '../submissions/submissions.service.js';
import { AttemptsService } from './attempts.service.js';

const slugSchema = z.string().regex(/^[a-z0-9-]{1,80}$/);
const ok = z.object({ ok: z.literal(true) });

/** Spec 7: verified challenges. Every route is owner-scoped in the service. */
@Controller()
export class AttemptsController {
  constructor(
    @Inject(AttemptsService) private readonly attempts: AttemptsService,
    @Inject(SubmissionsService) private readonly submissions: SubmissionsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get('verified')
  @ResponseSchema(verifiedListSchema)
  catalogue(@CurrentUser() user: User) {
    return this.attempts.catalogue(user);
  }

  @Post('verified/:slug/attempts')
  @RequireVerifiedEmail()
  @ResponseSchema(attemptSchema)
  async start(
    @Param('slug', new ZodPipe(slugSchema)) slug: string,
    @Body(new ZodPipe(startAttemptSchema)) body: z.infer<typeof startAttemptSchema>,
    @CurrentUser() user: User,
    @Req() req: ForgeRequest,
  ) {
    const row = await this.attempts.start(user, slug, body.language, clientIp(req, this.env));
    return this.attempts.view(user, row.id);
  }

  @Get('attempts')
  @ResponseSchema(attemptListSchema)
  list(@CurrentUser() user: User) {
    return this.attempts.list(user);
  }

  @Get('attempts/:id')
  @ResponseSchema(attemptSchema)
  get(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: User) {
    return this.attempts.view(user, id);
  }

  @Post('attempts/:id/events')
  @HttpCode(200)
  @ResponseSchema(z.object({ stored: z.boolean() }))
  events(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(eventBatchSchema)) body: EventBatch,
    @CurrentUser() user: User,
  ) {
    return this.attempts.recordEvents(user, id, body);
  }

  @Post('attempts/:id/run')
  @HttpCode(202)
  @RateClassOf('submission')
  @ResponseSchema(submissionSchema)
  async run(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(attemptCodeSchema)) body: { code: string },
    @CurrentUser() user: User,
  ) {
    const { sub, slug } = await this.attempts.execute(user, id, body.code, 'run');
    return this.submissions.toView(sub, slug);
  }

  @Post('attempts/:id/submit')
  @HttpCode(202)
  @RateClassOf('submission')
  @ResponseSchema(submissionSchema)
  async submit(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(attemptCodeSchema)) body: { code: string },
    @CurrentUser() user: User,
  ) {
    const { sub, slug } = await this.attempts.execute(user, id, body.code, 'submit');
    return this.submissions.toView(sub, slug);
  }

  @Get('attempts/:id/followup')
  @ResponseSchema(z.object({ question: followUpViewSchema.nullable() }))
  nextFollowUp(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: User) {
    return this.attempts.nextFollowUp(user, id);
  }

  @Post('attempts/:id/followup')
  @HttpCode(200)
  @ResponseSchema(z.object({ done: z.boolean() }))
  answer(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(followUpAnswerSchema)) body: z.infer<typeof followUpAnswerSchema>,
    @CurrentUser() user: User,
  ) {
    return this.attempts.answer(user, id, body);
  }

  @Post('attempts/:id/appeal')
  @HttpCode(200)
  @ResponseSchema(ok)
  async appeal(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(appealSchema)) body: z.infer<typeof appealSchema>,
    @CurrentUser() user: User,
    @Req() req: ForgeRequest,
  ) {
    await this.attempts.appeal(user, id, body.reason, clientIp(req, this.env));
    return { ok: true as const };
  }

  /** Owner only. Moderators use the admin route (which also requires 2FA). */
  @Get('attempts/:id/replay')
  @ResponseSchema(replaySchema)
  replay(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: User) {
    return this.attempts.replay(user, id, false);
  }
}

/** Spec L8 step 6: moderator review queue and appeal decisions. */
@Controller('admin/attempts')
@Roles('moderator', 'superadmin')
export class AdminAttemptsController {
  constructor(
    @Inject(AttemptsService) private readonly attempts: AttemptsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get('queue')
  @ResponseSchema(moderationQueueSchema)
  queue() {
    return this.attempts.moderationQueue();
  }

  @Get(':id/replay')
  @ResponseSchema(replaySchema)
  replay(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: User,
    @Req() req: ForgeRequest,
  ) {
    return this.attempts.replay(user, id, true, clientIp(req, this.env));
  }

  @Post(':id/decision')
  @HttpCode(200)
  @ResponseSchema(ok)
  async decide(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(reviewDecisionSchema)) body: z.infer<typeof reviewDecisionSchema>,
    @CurrentUser() user: User,
    @Req() req: ForgeRequest,
  ) {
    await this.attempts.decide(user, id, body, clientIp(req, this.env));
    return { ok: true as const };
  }
}
