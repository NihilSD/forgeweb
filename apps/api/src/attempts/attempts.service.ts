import { createHash, randomInt } from 'node:crypto';
import { gunzipSync, gzipSync } from 'node:zlib';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type Attempt as AttemptRow,
  type FollowUp as FollowUpRow,
  Prisma,
  type Submission as SubmissionRow,
  type User,
} from '@forge/db';
import {
  canonical,
  expectedAnswer,
  type FollowUpExpected,
  gradeFollowUp,
  type ProbeResult,
} from '@forge/problem-kit';
import {
  type Attempt,
  type AttemptEvent,
  type AttemptStatus,
  ErrorCode,
  type EventBatch,
  FOLLOWUP_SECONDS,
  type FollowUpView,
  type IntegritySignal,
  type Replay,
  type ServerAttemptEvent,
} from '@forge/shared';
import { AuditService } from '../audit/audit.service.js';
import { ApiError } from '../common/api-error.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';
import { PrismaService } from '../infra/prisma.service.js';
import { computeIntegrity } from '../integrity/integrity-score.js';
import { INTEGRITY } from '../integrity/integrity.config.js';
import { ContentService, type LoadedProblem } from '../problems/content.service.js';
import { SubmissionsService } from '../submissions/submissions.service.js';
import { purgeExpiredReplays } from './replay-retention.js';

/** Submissions this long after the timer ends are still accepted (network latency). */
const SUBMIT_GRACE_MS = 10_000;
const FOLLOWUP_MS = FOLLOWUP_SECONDS * 1000;
/** Answers may arrive this late (network) and still count. */
const ANSWER_GRACE_MS = 3_000;
/** A follow-up phase left this long is closed: unanswered questions count as wrong. */
const ABANDONED_FOLLOWUPS_MS = 15 * 60_000;
/** Client batches per attempt (one every 5 s is 720 per hour). */
const MAX_BATCHES = 3_000;

const OPEN: AttemptStatus[] = ['in_progress', 'followups'];
const BEST_ORDER: AttemptStatus[] = [
  'verified',
  'appealed',
  'unverified',
  'review',
  'followups',
  'in_progress',
  'expired',
];

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const pack = (value: unknown) => gzipSync(Buffer.from(JSON.stringify(value)));
const unpack = <T>(bytes: Uint8Array): T =>
  JSON.parse(gunzipSync(Buffer.from(bytes)).toString('utf8')) as T;

/** Spec 7: verified attempts, follow-ups, integrity score, appeals and moderation. */
@Injectable()
export class AttemptsService {
  private readonly logger = new Logger('Attempts');

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ContentService) private readonly content: ContentService,
    @Inject(SubmissionsService) private readonly submissions: SubmissionsService,
    @Inject(EntitlementsService) private readonly entitlements: EntitlementsService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  // ---------------------------------------------------------------- catalogue and start

  async catalogue(user: User) {
    const problems = await this.db.problem.findMany({
      where: { status: 'published', mode: { in: ['both', 'competitive'] } },
      include: { track: true, versions: true },
      orderBy: [{ difficulty: 'asc' }, { title: 'asc' }],
    });
    const mine = await this.db.attempt.findMany({
      where: { userId: user.id },
      select: { problemId: true, status: true },
    });
    const items = problems
      .filter((p) => !p.formats.includes('flag'))
      .map((p) => {
        const v = p.versions.find((x) => x.version === p.version)!;
        const statuses = mine.filter((a) => a.problemId === p.id).map((a) => a.status);
        const best = BEST_ORDER.find((s) => statuses.includes(s)) ?? null;
        return {
          slug: p.slug,
          title: p.title,
          difficulty: p.difficulty,
          track: p.track.slug,
          languages: p.languages,
          minutes: this.content.manifest(v).verifiedMinutes,
          best,
        };
      });
    const active = await this.findActive(user.id);
    return {
      items,
      remainingThisWeek: await this.entitlements.verifiedStartsRemaining(user),
      activeAttemptId: active?.id ?? null,
    };
  }

  private findActive(userId: string) {
    return this.db.attempt.findFirst({
      where: { userId, status: { in: OPEN } },
      orderBy: { startedAt: 'desc' },
    });
  }

  async start(user: User, slug: string, language: string, ip?: string): Promise<AttemptRow> {
    const problem = await this.content.getPublished(slug, { allowCompetitiveOnly: true });
    if (problem.mode === 'practice' || problem.formats.includes('flag'))
      throw ApiError.notFound('Verified challenge');
    if (!problem.languages.includes(language))
      throw new ApiError(
        ErrorCode.VALIDATION_FAILED,
        `This challenge doesn't support ${language}.`,
      );
    const manifest = this.content.manifest(problem.current);

    // Spec 7.1: a random seed per attempt, and an instance nobody else has been given.
    let seed = 0;
    let instanceHash = '';
    for (let i = 0; i < 8; i++) {
      seed = randomInt(0, 2 ** 32);
      const gen = await this.content.instance(problem.current, seed);
      instanceHash = sha256(canonical({ p: gen.instance.params, d: gen.instance.data ?? null }));
      const clash = await this.db.attempt.findFirst({
        where: { problemId: problem.id, instanceHash },
        select: { id: true },
      });
      if (!clash) break;
    }

    const row = await this.db.$transaction(async (tx) => {
      // One start at a time per user, so the weekly limit and "one active attempt" hold.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`attempt-start:${user.id}`}))`;
      const active = await tx.attempt.findFirst({
        where: { userId: user.id, status: { in: OPEN } },
        select: { id: true, endsAt: true, status: true },
      });
      if (active) {
        throw new ApiError(
          ErrorCode.CONFLICT,
          'Finish your current verified attempt before starting another.',
          { attemptId: active.id },
        );
      }
      const remaining = await this.entitlements.verifiedStartsRemaining(user);
      if (remaining === 0) {
        throw new ApiError(
          ErrorCode.LIMIT_REACHED,
          "You've used this week's free verified challenges. Forge Pro includes unlimited verified challenges.",
          { feature: 'unlimited_verified' },
        );
      }
      const now = new Date();
      return tx.attempt.create({
        data: {
          userId: user.id,
          problemId: problem.id,
          version: problem.version,
          language,
          seed: seed | 0,
          instanceHash,
          consentAt: now,
          startedAt: now,
          endsAt: new Date(now.getTime() + manifest.verifiedMinutes * 60_000),
        },
      });
    });
    await this.audit.log({
      actorId: user.id,
      action: 'attempt.started',
      target: row.id,
      ip,
      meta: { problem: slug },
    });
    return row;
  }

  // ---------------------------------------------------------------- reading

  /** The attempt if `user` owns it (others' attempts look missing), after settling timeouts. */
  private async owned(user: User, id: string): Promise<AttemptRow> {
    const row = await this.db.attempt.findUnique({ where: { id } });
    if (!row || row.userId !== user.id) throw ApiError.notFound('Attempt');
    return this.settle(row);
  }

  private async problemAt(row: AttemptRow): Promise<LoadedProblem> {
    const problem = await this.db.problem.findUniqueOrThrow({
      where: { id: row.problemId },
      include: { track: true },
    });
    // Always the version the attempt started on, even if the problem was republished since.
    return {
      ...problem,
      version: row.version,
      current: await this.content.version(row.problemId, row.version),
    };
  }

  async view(user: User, id: string): Promise<Attempt> {
    const row = await this.owned(user, id);
    const problem = await this.problemAt(row);
    const gen = await this.content.instance(problem.current, row.seed >>> 0);
    const lang = row.language as keyof ReturnType<ContentService['starters']>;
    const followUps = await this.db.followUp.findMany({ where: { attemptId: row.id } });
    const appeal = await this.db.appeal.findUnique({ where: { attemptId: row.id } });
    return {
      id: row.id,
      problemSlug: problem.slug,
      problemTitle: problem.title,
      language: row.language,
      status: row.status,
      startedAt: row.startedAt.toISOString(),
      endsAt: row.endsAt.toISOString(),
      submittedAt: row.submittedAt?.toISOString() ?? null,
      serverNow: new Date().toISOString(),
      statement: this.content.renderStatement(problem.current, gen),
      starter: this.content.starters(problem.current, gen)[lang] ?? '',
      entry: this.content.manifest(problem.current).entry?.[row.language] ?? null,
      visibleTests: this.content.visibleTests(gen.suite),
      score: row.score,
      integrityScore: row.integrityScore,
      followUps: {
        total: followUps.length,
        answered: followUps.filter((f) => f.answeredMs !== null).length,
        correct: OPEN.includes(row.status) ? 0 : followUps.filter((f) => f.correct).length,
      },
      appeal: appeal ? { status: appeal.outcome, reason: appeal.reason } : null,
      canAppeal: !appeal && (row.status === 'unverified' || row.status === 'review'),
    };
  }

  async list(user: User) {
    const rows = await this.db.attempt.findMany({
      where: { userId: user.id },
      include: { problem: { select: { slug: true, title: true } } },
      orderBy: { startedAt: 'desc' },
      take: 100,
    });
    return {
      items: rows.map((r) => ({
        id: r.id,
        problemSlug: r.problem.slug,
        problemTitle: r.problem.title,
        status: r.status,
        startedAt: r.startedAt.toISOString(),
        score: r.score,
        integrityScore: r.integrityScore,
      })),
    };
  }

  // ---------------------------------------------------------------- events

  async recordEvents(user: User, id: string, batch: EventBatch): Promise<{ stored: boolean }> {
    const row = await this.owned(user, id);
    if (!OPEN.includes(row.status))
      throw new ApiError(ErrorCode.ATTEMPT_CLOSED, 'This attempt is no longer recording.');
    if (batch.events.length === 0) return { stored: false };
    const batches = await this.db.attemptEvent.count({
      where: { attemptId: row.id, source: 'client' },
    });
    if (batches >= MAX_BATCHES)
      throw new ApiError(ErrorCode.LIMIT_REACHED, 'Too many event batches for one attempt.');
    try {
      await this.db.attemptEvent.create({
        data: {
          attemptId: row.id,
          seq: batch.seq,
          source: 'client',
          type: 'batch',
          t: batch.events[0]!.t,
          count: batch.events.length,
          payload: pack(batch.events),
        },
      });
      return { stored: true };
    } catch (err) {
      // A retried batch (same seq) is fine: it is already stored.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
        return { stored: false };
      throw err;
    }
  }

  private async serverEvent(row: AttemptRow, event: ServerAttemptEvent) {
    await this.db.attemptEvent.create({
      data: {
        attemptId: row.id,
        source: 'server',
        type: event.type,
        t: Math.max(0, Math.round(event.t)),
        count: 1,
        payload: pack([event]),
      },
    });
  }

  // ---------------------------------------------------------------- run and submit

  async execute(user: User, id: string, code: string, kind: 'run' | 'submit') {
    const row = await this.owned(user, id);
    if (row.status !== 'in_progress' || Date.now() > row.endsAt.getTime() + SUBMIT_GRACE_MS)
      throw new ApiError(ErrorCode.ATTEMPT_CLOSED, 'Time is up for this attempt.');
    const problem = await this.problemAt(row);
    const sub = await this.submissions.create(
      user,
      problem,
      { language: row.language as never, code },
      kind,
      { seed: row.seed >>> 0, attemptId: row.id },
    );
    return { sub, slug: problem.slug };
  }

  /** Submission hook: record the run/submit and move on to follow-ups after an accepted submit. */
  async onSubmissionFinished(sub: SubmissionRow) {
    if (!sub.attemptId) return;
    const row = await this.db.attempt.findUnique({ where: { id: sub.attemptId } });
    if (!row) return;
    await this.serverEvent(row, {
      type: sub.kind,
      t: sub.createdAt.getTime() - row.startedAt.getTime(),
      codeHash: sha256(sub.code),
      verdict: sub.verdict,
      passed: sub.testsPassed,
      total: sub.testsTotal,
    });
    if (sub.kind !== 'submit' || !sub.verdict || sub.verdict === 'internal_error') return;
    const pct = sub.testsTotal ? Math.round((100 * (sub.testsPassed ?? 0)) / sub.testsTotal) : 0;
    if (sub.verdict !== 'accepted') {
      await this.db.attempt.updateMany({
        where: { id: row.id, status: 'in_progress', OR: [{ score: null }, { score: { lt: pct } }] },
        data: { score: pct },
      });
      return;
    }
    // Only the first accepted submission ends the coding phase.
    const claimed = await this.db.attempt.updateMany({
      where: { id: row.id, status: 'in_progress' },
      data: { status: 'followups', submissionId: sub.id, submittedAt: sub.createdAt, score: 100 },
    });
    if (claimed.count !== 1) return;
    await this.createFollowUps(row, sub);
  }

  private async createFollowUps(row: AttemptRow, sub: SubmissionRow) {
    let questions: Awaited<ReturnType<SubmissionsService['followUpsFor']>> = [];
    try {
      questions = await this.submissions.followUpsFor(sub);
    } catch (err) {
      this.logger.error(`followups failed for attempt ${row.id}: ${(err as Error).message}`);
    }
    const probes = ((sub.result ?? {}) as { probes?: Record<string, ProbeResult> }).probes ?? {};
    const asked = questions
      .map((q) => ({ q, expected: expectedAnswer(q, sub.code, probes[q.id]) }))
      .filter((x): x is { q: (typeof questions)[number]; expected: FollowUpExpected } =>
        Boolean(x.expected),
      );
    await this.db.followUp.createMany({
      data: asked.map(({ q, expected }, order) => ({
        attemptId: row.id,
        questionId: q.id,
        kind: q.kind,
        prompt: q.prompt,
        options: q.options ?? Prisma.JsonNull,
        expected: expected as Prisma.InputJsonValue,
        order,
      })),
    });
    if (asked.length === 0) await this.finish(row.id);
  }

  // ---------------------------------------------------------------- follow-ups

  async nextFollowUp(user: User, id: string): Promise<{ question: FollowUpView | null }> {
    const row = await this.owned(user, id);
    if (row.status !== 'followups') return { question: null };
    const all = await this.db.followUp.findMany({
      where: { attemptId: row.id },
      orderBy: { order: 'asc' },
    });
    for (const f of all) {
      if (f.answeredMs !== null) continue;
      if (f.shownAt && Date.now() - f.shownAt.getTime() > FOLLOWUP_MS + ANSWER_GRACE_MS) {
        await this.closeQuestion(row, f, null, false, FOLLOWUP_MS);
        continue;
      }
      let shown = f;
      if (!f.shownAt) {
        await this.db.followUp.updateMany({
          where: { id: f.id, shownAt: null },
          data: { shownAt: new Date() },
        });
        shown = await this.db.followUp.findUniqueOrThrow({ where: { id: f.id } });
      }
      const code =
        shown.kind === 'change' && row.submissionId
          ? (await this.db.submission.findUniqueOrThrow({ where: { id: row.submissionId } })).code
          : null;
      return {
        question: {
          id: shown.questionId,
          kind: shown.kind as FollowUpView['kind'],
          prompt: shown.prompt,
          options: (shown.options as string[] | null) ?? null,
          code,
          index: shown.order + 1,
          total: all.length,
          deadline: new Date(shown.shownAt!.getTime() + FOLLOWUP_MS).toISOString(),
        },
      };
    }
    await this.finish(row.id);
    return { question: null };
  }

  async answer(
    user: User,
    id: string,
    input: { questionId: string; answer: string },
  ): Promise<{ done: boolean }> {
    const row = await this.owned(user, id);
    if (row.status !== 'followups')
      throw new ApiError(ErrorCode.ATTEMPT_CLOSED, 'Follow-up questions are closed.');
    const f = await this.db.followUp.findUnique({
      where: { attemptId_questionId: { attemptId: row.id, questionId: input.questionId } },
    });
    if (!f || !f.shownAt || f.answeredMs !== null)
      throw new ApiError(ErrorCode.CONFLICT, 'This question is not open.');
    const elapsed = Date.now() - f.shownAt.getTime();
    const inTime = elapsed <= FOLLOWUP_MS + ANSWER_GRACE_MS;
    const correct = inTime && gradeFollowUp(f.expected as FollowUpExpected, input.answer);
    await this.closeQuestion(row, f, input.answer, correct, Math.min(elapsed, FOLLOWUP_MS));
    const open = await this.db.followUp.count({
      where: { attemptId: row.id, answeredMs: null },
    });
    if (open === 0) await this.finish(row.id);
    return { done: open === 0 };
  }

  private async closeQuestion(
    row: AttemptRow,
    f: FollowUpRow,
    answer: string | null,
    correct: boolean,
    answeredMs: number,
  ) {
    const closed = await this.db.followUp.updateMany({
      where: { id: f.id, answeredMs: null },
      data: { answer, correct, answeredMs },
    });
    if (closed.count !== 1) return;
    await this.serverEvent(row, {
      type: 'followup',
      t: Date.now() - row.startedAt.getTime(),
      questionId: f.questionId,
      correct,
      answeredMs,
    });
  }

  // ---------------------------------------------------------------- scoring

  /** Spec 7.1 step 6: compute the integrity score and the final status. */
  private async finish(id: string) {
    const row = await this.db.attempt.findUniqueOrThrow({
      where: { id },
      include: { user: true, followUps: true, events: { orderBy: [{ seq: 'asc' }, { t: 'asc' }] } },
    });
    if (row.status !== 'followups' || !row.submissionId || !row.submittedAt) return;
    const sub = await this.db.submission.findUniqueOrThrow({ where: { id: row.submissionId } });
    const problem = await this.problemAt(row);
    const gen = await this.content.instance(problem.current, row.seed >>> 0);
    const starter =
      this.content.starters(problem.current, gen)[
        row.language as keyof ReturnType<ContentService['starters']>
      ] ?? '';

    const clientEvents = row.events
      .filter((e) => e.source === 'client')
      .flatMap((e) => unpack<AttemptEvent[]>(e.payload));
    const server = row.events
      .filter((e) => e.source === 'server' && (e.type === 'run' || e.type === 'submit'))
      .flatMap((e) => unpack<ServerAttemptEvent[]>(e.payload))
      .flatMap((e) =>
        e.type === 'run' || e.type === 'submit'
          ? [{ type: e.type, t: e.t, passed: e.verdict === 'accepted' }]
          : [],
      );

    const result = computeIntegrity({
      starter,
      finalCode: sub.code,
      events: clientEvents,
      server,
      followUps: row.followUps.map((f) => ({ correct: f.correct === true })),
      solveMs: row.submittedAt.getTime() - row.startedAt.getTime(),
      typicalSolveMs: await this.typicalSolveMs(row.problemId),
      budgetMs: row.endsAt.getTime() - row.startedAt.getTime(),
      account: {
        ageDays: (Date.now() - row.user.createdAt.getTime()) / 86_400_000,
        emailVerified: Boolean(row.user.emailVerifiedAt),
        priorVerified: await this.db.attempt.count({
          where: { userId: row.userId, status: 'verified', id: { not: row.id } },
        }),
      },
    });
    const done = await this.db.attempt.updateMany({
      where: { id, status: 'followups' },
      data: {
        status: result.status,
        integrityScore: result.score,
        signals: result.signals as unknown as Prisma.InputJsonValue,
        finishedAt: new Date(),
      },
    });
    if (done.count === 1) {
      await this.audit.log({
        actorId: row.userId,
        action: 'attempt.finished',
        target: id,
        meta: { status: result.status, integrityScore: result.score },
      });
    }
  }

  /** Median time to an accepted submit among verified attempts (null until enough samples). */
  private async typicalSolveMs(problemId: string): Promise<number | null> {
    const rows = await this.db.attempt.findMany({
      where: { problemId, status: 'verified', submittedAt: { not: null } },
      select: { startedAt: true, submittedAt: true },
      orderBy: { submittedAt: 'desc' },
      take: 500,
    });
    if (rows.length < INTEGRITY.speed.minSamples) return null;
    const times = rows
      .map((r) => r.submittedAt!.getTime() - r.startedAt.getTime())
      .sort((a, b) => a - b);
    const mid = Math.floor(times.length / 2);
    return times.length % 2 ? times[mid]! : (times[mid - 1]! + times[mid]!) / 2;
  }

  /**
   * Applies timeouts lazily: an attempt past its time without an accepted submit expires (once its
   * last submissions are graded); an abandoned follow-up phase is closed and scored.
   */
  private async settle(row: AttemptRow): Promise<AttemptRow> {
    const now = Date.now();
    if (row.status === 'in_progress' && now > row.endsAt.getTime() + SUBMIT_GRACE_MS) {
      const pending = await this.db.submission.count({
        where: { attemptId: row.id, status: { in: ['queued', 'running'] } },
      });
      if (pending === 0) {
        await this.db.attempt.updateMany({
          where: { id: row.id, status: 'in_progress' },
          data: { status: 'expired', finishedAt: new Date() },
        });
      }
    } else if (
      row.status === 'followups' &&
      row.submittedAt &&
      now - row.submittedAt.getTime() > ABANDONED_FOLLOWUPS_MS
    ) {
      const open = await this.db.followUp.findMany({
        where: { attemptId: row.id, answeredMs: null },
      });
      for (const f of open) await this.closeQuestion(row, f, null, false, FOLLOWUP_MS);
      await this.finish(row.id);
    } else {
      return row;
    }
    return this.db.attempt.findUniqueOrThrow({ where: { id: row.id } });
  }

  // ---------------------------------------------------------------- appeals, replays, moderation

  async appeal(user: User, id: string, reason: string, ip?: string) {
    const row = await this.owned(user, id);
    if (row.status !== 'unverified' && row.status !== 'review')
      throw new ApiError(ErrorCode.CONFLICT, 'Only unverified results can be appealed.');
    await this.db.$transaction([
      this.db.appeal.create({ data: { attemptId: row.id, reason, previous: row.status } }),
      this.db.attempt.update({ where: { id: row.id }, data: { status: 'appealed' } }),
    ]);
    await this.audit.log({ actorId: user.id, action: 'attempt.appealed', target: row.id, ip });
  }

  /** Owner view (`moderator` = false) or moderator view with the signal breakdown. */
  async replay(viewer: User, id: string, moderator: boolean, ip?: string): Promise<Replay> {
    const row = await this.db.attempt.findUnique({
      where: { id },
      include: {
        problem: { select: { title: true } },
        followUps: { orderBy: { order: 'asc' } },
        events: { orderBy: [{ seq: 'asc' }, { t: 'asc' }] },
      },
    });
    if (!row || (!moderator && row.userId !== viewer.id)) throw ApiError.notFound('Attempt');
    if (row.replayDeletedAt) throw ApiError.notFound('Replay');
    if (moderator) {
      await this.audit.log({
        actorId: viewer.id,
        action: 'attempt.replay_viewed',
        target: row.id,
        ip,
      });
    }
    const problem = await this.problemAt(row);
    const gen = await this.content.instance(problem.current, row.seed >>> 0);
    const starter =
      this.content.starters(problem.current, gen)[
        row.language as keyof ReturnType<ContentService['starters']>
      ] ?? '';
    const finalCode = row.submissionId
      ? ((await this.db.submission.findUnique({ where: { id: row.submissionId } }))?.code ?? null)
      : null;
    return {
      attemptId: row.id,
      problemTitle: row.problem.title,
      language: row.language,
      status: row.status,
      startedAt: row.startedAt.toISOString(),
      durationMs: (row.finishedAt ?? new Date()).getTime() - row.startedAt.getTime(),
      starter,
      finalCode,
      events: row.events
        .filter((e) => e.source === 'client')
        .flatMap((e) => unpack<AttemptEvent[]>(e.payload)),
      serverEvents: row.events
        .filter((e) => e.source === 'server')
        .flatMap((e) => unpack<Record<string, unknown>[]>(e.payload)),
      followUps: row.followUps.map((f) => ({
        id: f.questionId,
        kind: f.kind,
        prompt: f.prompt,
        answer: f.answer,
        correct: OPEN.includes(row.status) ? null : f.correct,
        answeredMs: f.answeredMs,
      })),
      integrityScore: row.integrityScore,
      signals: moderator ? ((row.signals as IntegritySignal[] | null) ?? []) : null,
    };
  }

  async moderationQueue() {
    const rows = await this.db.attempt.findMany({
      where: { status: { in: ['review', 'appealed'] } },
      include: {
        user: { select: { handle: true, displayName: true } },
        problem: { select: { title: true } },
        appeal: true,
      },
      orderBy: { submittedAt: 'asc' },
      take: 200,
    });
    return {
      items: rows.map((r) => ({
        attemptId: r.id,
        // Never the e-mail address (CLAUDE.md: no full e-mails in logs or admin lists).
        user: r.user.handle ?? r.user.displayName ?? r.userId.slice(0, 8),
        problemTitle: r.problem.title,
        status: r.status,
        integrityScore: r.integrityScore,
        appealReason: r.appeal?.reason ?? null,
        submittedAt: r.submittedAt?.toISOString() ?? null,
      })),
    };
  }

  async decide(
    moderator: User,
    id: string,
    input: { decision: 'verified' | 'unverified'; notes: string },
    ip?: string,
  ) {
    const row = await this.db.attempt.findUnique({ where: { id }, include: { appeal: true } });
    if (!row) throw ApiError.notFound('Attempt');
    if (row.status !== 'review' && row.status !== 'appealed')
      throw new ApiError(ErrorCode.CONFLICT, 'This attempt is not waiting for a decision.');
    if (row.userId === moderator.id)
      throw ApiError.forbidden('You cannot review your own attempt.');
    await this.db.$transaction([
      this.db.review.create({
        data: {
          attemptId: id,
          reviewerId: moderator.id,
          decision: input.decision,
          notes: input.notes,
        },
      }),
      this.db.attempt.update({ where: { id }, data: { status: input.decision } }),
      ...(row.appeal?.outcome === 'pending'
        ? [
            this.db.appeal.update({
              where: { attemptId: id },
              data: {
                outcome: input.decision === 'verified' ? 'upheld' : 'denied',
                decidedAt: new Date(),
              },
            }),
          ]
        : []),
    ]);
    await this.audit.log({
      actorId: moderator.id,
      action: 'attempt.reviewed',
      target: id,
      ip,
      meta: { decision: input.decision, appeal: Boolean(row.appeal) },
    });
  }

  /** Spec 3.2: delete replays older than 12 months unless the user keeps them public. */
  purgeExpiredReplays(now = new Date()): Promise<number> {
    return purgeExpiredReplays(this.db, now);
  }

  /** Practice hints and editorials are off for a problem while a verified attempt on it is open. */
  async activeOn(userId: string, problemId: string): Promise<boolean> {
    return (
      (await this.db.attempt.count({
        where: { userId, problemId, status: { in: OPEN } },
      })) > 0
    );
  }
}
