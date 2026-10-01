import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { GLICKO2_DEFAULTS, idlePeriods, inflate, rate, type TrackRating } from '@forge/shared';
import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { ENV, type Env } from '../config/env.js';
import { PrismaService } from '../infra/prisma.service.js';

export const RATING_QUEUE = 'rating-updates';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ApplyOutcome = 'applied' | 'duplicate' | 'skipped';

/**
 * Spec 8 / V1.1: Glicko-2 rating per user per track. The only input is a **final Competitive
 * result**: today a verified attempt (win) or an attempt that ran out of time (loss); contests and
 * duels later. Practice data is never read here, so no Practice activity can change a rating.
 *
 * Updates go through the `rating-updates` queue and are idempotent per event (`eventKey`), with a
 * per-user-and-track advisory lock so several API instances apply events one at a time.
 */
@Injectable()
export class RatingsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Ratings');
  private readonly connection: Redis;
  private readonly queue: Queue<{ attemptId: string }>;
  private worker: Worker<{ attemptId: string }> | null = null;

  constructor(
    @Inject(ENV) env: Env,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {
    this.connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    this.queue = new Queue(RATING_QUEUE, { connection: this.connection });
  }

  private get db() {
    return this.prisma.client;
  }

  onModuleInit() {
    this.worker = new Worker<{ attemptId: string }>(
      RATING_QUEUE,
      async (job) => {
        await this.applyAttempt(job.data.attemptId);
      },
      { connection: this.connection.duplicate(), concurrency: 1 },
    );
    this.worker.on('error', (err) => this.logger.error(err.message));
  }

  async onModuleDestroy() {
    await this.worker?.close();
    await this.queue.close();
    await this.connection.quit().catch(() => undefined);
  }

  async enqueueAttempt(attemptId: string) {
    await this.queue.add(
      'attempt',
      { attemptId },
      {
        jobId: `attempt-${attemptId}`,
        // Removed when done, so a result that becomes final later can be queued again.
        removeOnComplete: true,
        removeOnFail: 1000,
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
      },
    );
  }

  /** Waits until the queue is empty (tests and the CLI). */
  async drain(timeoutMs = 15_000) {
    const until = Date.now() + timeoutMs;
    for (;;) {
      const c = await this.queue.getJobCounts('waiting', 'active', 'delayed', 'prioritized');
      if (Object.values(c).every((n) => n === 0)) return;
      if (Date.now() > until) throw new Error(`rating queue not drained: ${JSON.stringify(c)}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  /** Queues every final rated attempt that has no rating change yet (lost jobs, late results). */
  async reconcile(): Promise<number> {
    const rows = await this.db.$queryRaw<{ id: string }[]>`
      SELECT a.id::text AS id FROM "Attempt" a
      WHERE a.status IN ('verified', 'expired') AND a."finishedAt" IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM "RatingChange" rc
          WHERE rc."userId" = a."userId" AND rc."eventKey" = 'attempt:' || a.id::text)
      ORDER BY a."finishedAt" ASC
      LIMIT 500`;
    for (const r of rows) await this.enqueueAttempt(r.id);
    return rows.length;
  }

  /** Applies one attempt's result. Safe to call any number of times. */
  async applyAttempt(attemptId: string): Promise<ApplyOutcome> {
    if (!UUID.test(attemptId)) return 'skipped';
    const a = await this.db.attempt.findUnique({
      where: { id: attemptId },
      include: {
        problem: { select: { id: true, trackId: true, rating: true, ratingDeviation: true } },
      },
    });
    if (!a || !a.finishedAt) return 'skipped';
    const score = a.status === 'verified' ? 1 : a.status === 'expired' ? 0 : null;
    if (score === null) return 'skipped';
    const at = a.finishedAt;
    const eventKey = `attempt:${a.id}`;
    const { trackId } = a.problem;

    return this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`rating:${a.userId}:${trackId}`}))`;
      const done = await tx.ratingChange.findUnique({
        where: { userId_eventKey: { userId: a.userId, eventKey } },
        select: { id: true },
      });
      if (done) return 'duplicate' as const;
      const cur = await tx.rating.findUnique({
        where: { userId_trackId: { userId: a.userId, trackId } },
      });
      const before = inflate(
        {
          rating: cur?.rating ?? GLICKO2_DEFAULTS.rating,
          rd: cur?.rd ?? GLICKO2_DEFAULTS.rd,
          volatility: cur?.volatility ?? GLICKO2_DEFAULTS.volatility,
        },
        idlePeriods(cur?.lastEventAt ?? null, at),
      );
      const opponent = { rating: a.problem.rating, rd: a.problem.ratingDeviation };
      const after = rate(before, [{ opponent, score }]);
      const lastEventAt = cur?.lastEventAt && cur.lastEventAt > at ? cur.lastEventAt : at;
      await tx.rating.upsert({
        where: { userId_trackId: { userId: a.userId, trackId } },
        create: { userId: a.userId, trackId, ...after, events: 1, lastEventAt },
        update: { ...after, events: { increment: 1 }, lastEventAt },
      });
      await tx.ratingChange.create({
        data: {
          userId: a.userId,
          trackId,
          eventKey,
          kind: 'verified',
          problemId: a.problem.id,
          score,
          opponent: opponent.rating,
          ratingBefore: before.rating,
          ratingAfter: after.rating,
          rdBefore: before.rd,
          rdAfter: after.rd,
          volatility: after.volatility,
          at,
        },
      });
      return 'applied' as const;
    });
  }

  /** The signed-in user's ratings for every track. Hidden values never leave the server. */
  async forUser(userId: string, now = new Date()): Promise<{ tracks: TrackRating[] }> {
    const [tracks, rows] = await Promise.all([
      this.db.track.findMany({
        orderBy: { order: 'asc' },
        select: { id: true, slug: true, name: true },
      }),
      this.db.rating.findMany({ where: { userId } }),
    ]);
    const byTrack = new Map(rows.map((r) => [r.trackId, r]));
    const out: TrackRating[] = [];
    for (const t of tracks) {
      const r = byTrack.get(t.id);
      const events = r?.events ?? 0;
      const visible = Boolean(r) && events >= GLICKO2_DEFAULTS.placementEvents;
      let history: TrackRating['history'] = [];
      if (visible) {
        const changes = await this.db.ratingChange.findMany({
          where: { userId, trackId: t.id },
          orderBy: { at: 'desc' },
          take: 200,
          include: { problem: { select: { slug: true, title: true } } },
        });
        history = changes.reverse().map((c) => ({
          at: c.at.toISOString(),
          kind: c.kind,
          rating: Math.round(c.ratingAfter),
          change: Math.round(c.ratingAfter) - Math.round(c.ratingBefore),
          result: c.score >= 1 ? ('solved' as const) : ('not_solved' as const),
          problem: c.problem,
        }));
      }
      const current = r && visible ? inflate(r, idlePeriods(r.lastEventAt, now)) : null;
      out.push({
        track: { slug: t.slug, name: t.name },
        rating: current ? Math.round(current.rating) : null,
        uncertainty: current ? Math.round(2 * current.rd) : null,
        events,
        placementRemaining: Math.max(0, GLICKO2_DEFAULTS.placementEvents - events),
        history,
      });
    }
    return { tracks: out };
  }
}
