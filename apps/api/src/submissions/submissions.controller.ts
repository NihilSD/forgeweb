import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import type { User } from '@forge/db';
import { type RunnerCallback, verifyCallback } from '@forge/problem-kit';
import {
  ErrorCode,
  idempotencyKeySchema,
  type RunInput,
  runSchema,
  submissionListSchema,
  submissionSchema,
  submitSchema,
} from '@forge/shared';
import type { Request } from 'express';
import { z } from 'zod';
import { ApiError } from '../common/api-error.js';
import { CurrentUser, Public, SkipCsrf } from '../common/request-context.js';
import { ResponseSchema } from '../common/response-schema.js';
import { parseOrThrow, ZodPipe } from '../common/zod.js';
import { PrismaService } from '../infra/prisma.service.js';
import { ContentService } from '../problems/content.service.js';
import { RateClassOf } from '../rate-limit/rate-limit.guard.js';
import { RunnerQueueService } from './runner-queue.service.js';
import { SubmissionsService } from './submissions.service.js';

const slugSchema = z.string().regex(/^[a-z0-9-]{1,80}$/);

@Controller()
export class SubmissionsController {
  constructor(
    @Inject(SubmissionsService) private readonly submissions: SubmissionsService,
    @Inject(ContentService) private readonly content: ContentService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  @Post('problems/:slug/run')
  @HttpCode(202)
  @RateClassOf('submission')
  @ResponseSchema(submissionSchema)
  async run(
    @Param('slug', new ZodPipe(slugSchema)) slug: string,
    @Body(new ZodPipe(runSchema)) body: RunInput,
    @CurrentUser() user: User,
  ) {
    const problem = await this.content.getPublished(slug);
    const row = await this.submissions.create(user, problem, body, 'run');
    return this.submissions.toView(row, slug);
  }

  @Post('problems/:slug/submit')
  @HttpCode(202)
  @RateClassOf('submission')
  @ResponseSchema(submissionSchema)
  async submit(
    @Param('slug', new ZodPipe(slugSchema)) slug: string,
    @Body(new ZodPipe(submitSchema)) body: RunInput,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() user: User,
  ) {
    const key = idempotencyKey ? parseOrThrow(idempotencyKeySchema, idempotencyKey) : undefined;
    const problem = await this.content.getPublished(slug);
    const row = await this.submissions.create(user, problem, body, 'submit', {
      idempotencyKey: key,
    });
    return this.submissions.toView(row, slug);
  }

  @Get('submissions/:id')
  @ResponseSchema(submissionSchema)
  async get(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: User) {
    const row = await this.prisma.client.submission.findUnique({
      where: { id },
      include: { problem: true },
    });
    // Other users' submissions look exactly like missing ones.
    if (!row || row.userId !== user.id) throw ApiError.notFound('Submission');
    return this.submissions.toView(row, row.problem.slug);
  }

  @Get('problems/:slug/submissions')
  @ResponseSchema(submissionListSchema)
  async history(@Param('slug', new ZodPipe(slugSchema)) slug: string, @CurrentUser() user: User) {
    const problem = await this.content.getPublished(slug);
    const rows = await this.prisma.client.submission.findMany({
      where: { userId: user.id, problemId: problem.id, attemptId: null },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return {
      items: rows.map((r) => {
        const { tests: _t, customOutput: _c, ...rest } = this.submissions.toView(r, slug);
        return { ...rest, code: r.code };
      }),
    };
  }
}

/** Runner results. Authenticated by HMAC over the raw body, not by session or CSRF. */
@Public()
@SkipCsrf()
@Controller('internal/runner')
export class RunnerCallbackController {
  constructor(
    @Inject(SubmissionsService) private readonly submissions: SubmissionsService,
    @Inject(RunnerQueueService) private readonly runner: RunnerQueueService,
  ) {}

  @Post('callback')
  @HttpCode(200)
  @ResponseSchema(z.object({ ok: z.literal(true), outcome: z.enum(['stored', 'retried']) }))
  async callback(@Req() req: Request) {
    const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
    const headers = {
      'x-forge-timestamp': req.header('x-forge-timestamp'),
      'x-forge-key': req.header('x-forge-key'),
      'x-forge-signature': req.header('x-forge-signature'),
    };
    if (!raw || !verifyCallback(this.runner.callbackKeys, raw, headers)) {
      throw new ApiError(ErrorCode.UNAUTHENTICATED, 'Invalid runner signature.');
    }
    let body: RunnerCallback;
    try {
      body = JSON.parse(raw) as RunnerCallback;
    } catch {
      throw new ApiError(ErrorCode.BAD_REQUEST, 'Malformed callback.');
    }
    if (typeof body.jobId !== 'string' || !body.result || !Array.isArray(body.result.tests)) {
      throw new ApiError(ErrorCode.BAD_REQUEST, 'Malformed callback.');
    }
    return { ok: true as const, outcome: await this.submissions.handleCallback(body) };
  }
}
