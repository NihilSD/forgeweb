import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma, type Submission as SubmissionRow, type User } from '@forge/db';
import { grade, type GradedTest, type RunnerCallback, type TestSuite } from '@forge/problem-kit';
import {
  ErrorCode,
  type ExecRequest,
  type ExecResult,
  type RunInput,
  type Submission,
} from '@forge/shared';
import { ApiError } from '../common/api-error.js';
import { PrismaService } from '../infra/prisma.service.js';
import { ContentService, type LoadedProblem } from '../problems/content.service.js';
import { RunnerQueueService } from './runner-queue.service.js';

/** How many unfinished submissions one user may have at a time. */
const MAX_PENDING_PER_USER = 3;
/** Internal errors are retried once and never count against the user (spec 6.2). */
const MAX_ATTEMPTS = 2;

export interface SubmissionHooks {
  /** Called once per finished submission (practice progress, XP, mastery…). */
  onFinished?: (sub: SubmissionRow) => Promise<void>;
}

@Injectable()
export class SubmissionsService {
  private readonly logger = new Logger('Submissions');
  readonly hooks: SubmissionHooks[] = [];

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ContentService) private readonly content: ContentService,
    @Inject(RunnerQueueService) private readonly runner: RunnerQueueService,
  ) {}

  async create(
    user: User,
    problem: LoadedProblem,
    input: RunInput,
    kind: 'run' | 'submit',
    opts: { idempotencyKey?: string | undefined; seed?: number; attemptId?: string } = {},
  ): Promise<SubmissionRow> {
    if (!problem.languages.includes(input.language)) {
      throw new ApiError(
        ErrorCode.VALIDATION_FAILED,
        `This problem doesn't support ${input.language}.`,
      );
    }
    if (this.content.manifest(problem.current).format === 'flag') {
      throw new ApiError(
        ErrorCode.BAD_REQUEST,
        'Submit the flag instead of code for this challenge.',
      );
    }
    if (input.customArgs && (kind !== 'run' || input.language === 'sql')) {
      throw new ApiError(
        ErrorCode.BAD_REQUEST,
        'Custom input is only available when running code.',
      );
    }
    if (opts.idempotencyKey) {
      const existing = await this.prisma.client.submission.findUnique({
        where: { userId_idempotencyKey: { userId: user.id, idempotencyKey: opts.idempotencyKey } },
      });
      if (existing) return existing;
    }
    const pending = await this.prisma.client.submission.count({
      where: {
        userId: user.id,
        status: { in: ['queued', 'running'] },
        createdAt: { gt: new Date(Date.now() - 10 * 60_000) },
      },
    });
    if (pending >= MAX_PENDING_PER_USER) {
      throw new ApiError(
        ErrorCode.RATE_LIMITED,
        'Wait for your running submissions to finish first.',
      );
    }

    let row: SubmissionRow;
    try {
      row = await this.prisma.client.submission.create({
        data: {
          userId: user.id,
          problemId: problem.id,
          version: problem.version,
          language: input.language,
          code: input.code,
          kind,
          // Seeds are uint32; Postgres INT is signed. Stored as int32, read back with >>> 0.
          seed: (opts.seed ?? this.content.practiceSeed(user.id, problem.id)) | 0,
          ...(input.customArgs ? { customInput: input.customArgs as Prisma.InputJsonValue } : {}),
          ...(opts.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : {}),
          ...(opts.attemptId ? { attemptId: opts.attemptId } : {}),
        },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        opts.idempotencyKey
      ) {
        return this.prisma.client.submission.findUniqueOrThrow({
          where: {
            userId_idempotencyKey: { userId: user.id, idempotencyKey: opts.idempotencyKey },
          },
        });
      }
      throw err;
    }
    await this.dispatch(row);
    return this.prisma.client.submission.findUniqueOrThrow({ where: { id: row.id } });
  }

  /** Rebuilds the tests from the stored seed; hidden tests are never persisted. */
  private async suiteFor(row: SubmissionRow): Promise<{ suite: TestSuite; request: ExecRequest }> {
    const version = await this.content.version(row.problemId, row.version);
    const manifest = this.content.manifest(version);
    const gen = await this.content.instance(version, row.seed >>> 0);
    const suite: TestSuite =
      row.kind === 'submit' ? gen.suite : { visible: gen.suite.visible, hidden: [] };
    const custom = row.customInput as unknown[] | null;
    const tests = custom
      ? [{ id: 'custom', args: custom }]
      : [...suite.visible, ...suite.hidden].map((t) => ({
          id: t.id,
          ...(t.args ? { args: t.args } : {}),
          ...(t.setupSql ? { setupSql: t.setupSql } : {}),
        }));
    const entry = manifest.entry?.[row.language];
    return {
      suite,
      request: {
        language: row.language as ExecRequest['language'],
        code: row.code,
        ...(entry ? { entry } : {}),
        tests,
        limits: this.content.limits(version),
      },
    };
  }

  private async dispatch(row: SubmissionRow) {
    const { request } = await this.suiteFor(row);
    const jobId = `${row.id}.${row.attempts + 1}.${randomUUID().slice(0, 8)}`;
    await this.prisma.client.submission.update({
      where: { id: row.id },
      data: { jobId, attempts: { increment: 1 }, status: 'queued' },
    });
    await this.runner.enqueue({ jobId, issuedAt: Date.now(), request });
  }

  /**
   * Stores a runner result. Signature is checked by the controller; here the job id must be the
   * submission's *current* job and the submission must still be open, so replays are rejected.
   */
  async handleCallback(body: RunnerCallback): Promise<'stored' | 'retried'> {
    const row = await this.prisma.client.submission.findUnique({ where: { jobId: body.jobId } });
    if (!row || row.status === 'done')
      throw new ApiError(ErrorCode.CONFLICT, 'Unknown or already processed job.');

    const result = body.result;
    if (result.status === 'internal_error' && row.attempts < MAX_ATTEMPTS) {
      this.logger.warn(
        `internal error on ${row.id} (attempt ${row.attempts}), retrying: ${result.message ?? ''}`,
      );
      await this.dispatch(row);
      return 'retried';
    }
    const stored = await this.finalize(row, result);
    // Claim atomically: only the first callback for this job id can close the submission.
    const claimed = await this.prisma.client.submission.updateMany({
      where: { id: row.id, jobId: body.jobId, status: { not: 'done' } },
      data: stored,
    });
    if (claimed.count !== 1) throw new ApiError(ErrorCode.CONFLICT, 'Already processed.');
    const finished = await this.prisma.client.submission.findUniqueOrThrow({
      where: { id: row.id },
    });
    for (const h of this.hooks) {
      await h
        .onFinished?.(finished)
        .catch((err: Error) => this.logger.error(`hook failed: ${err.message}`));
    }
    return 'stored';
  }

  private async finalize(
    row: SubmissionRow,
    result: ExecResult,
  ): Promise<Prisma.SubmissionUpdateManyMutationInput> {
    const common = { status: 'done' as const, finishedAt: new Date(), memoryKb: result.memoryKb };
    if (row.customInput) {
      const t = result.tests[0];
      const custom = {
        value: t?.value,
        ...(t?.stdout ? { stdout: t.stdout } : {}),
        ...(t?.error ? { error: t.error } : {}),
      };
      const verdict =
        result.status === 'ok'
          ? t?.status === 'ok'
            ? 'accepted'
            : t?.status === 'error'
              ? 'runtime_error'
              : (t?.status ?? 'runtime_error')
          : result.status;
      return {
        ...common,
        verdict: verdict as SubmissionRow['verdict'] & string,
        runtimeMs: Math.round(t?.timeMs ?? 0),
        result: { customOutput: custom, message: result.message ?? null } as Prisma.InputJsonValue,
      };
    }
    const { suite } = await this.suiteFor(row);
    const version = await this.content.version(row.problemId, row.version);
    const g = grade(suite, result, this.content.manifest(version).comparator);
    return {
      ...common,
      verdict: g.verdict,
      runtimeMs: g.runtimeMs,
      testsPassed: g.testsPassed,
      testsTotal: g.testsTotal,
      result: { tests: g.tests, message: g.message ?? null } as unknown as Prisma.InputJsonValue,
    };
  }

  /** Client view. Hidden-test error output is dropped (only its category is shown). */
  toView(row: SubmissionRow, slug: string): Submission {
    const r = (row.result ?? {}) as {
      tests?: GradedTest[];
      message?: string | null;
      customOutput?: Submission['customOutput'];
    };
    return {
      id: row.id,
      problemSlug: slug,
      language: row.language,
      kind: row.kind,
      status: row.status,
      verdict: row.verdict,
      runtimeMs: row.runtimeMs,
      memoryKb: row.memoryKb,
      testsPassed: row.testsPassed,
      testsTotal: row.testsTotal,
      message: r.message ?? null,
      tests: (r.tests ?? []).map((t) =>
        t.visible
          ? t
          : {
              id: t.id,
              category: t.category,
              visible: false,
              passed: t.passed,
              verdict: t.verdict,
              timeMs: t.timeMs,
            },
      ),
      customOutput: r.customOutput ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
