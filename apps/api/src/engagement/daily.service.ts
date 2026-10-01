import { createHash } from 'node:crypto';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import type { Daily } from '@forge/shared';
import { ENV, type Env } from '../config/env.js';
import { PrismaService } from '../infra/prisma.service.js';

/** The daily challenge date: it changes at midnight UTC (spec 8). */
export function utcDate(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/**
 * Picks the day's problem for one track from the queue of eligible problems: the ones used as a
 * daily least often come first, then the ones used longest ago, then a stable hash of date and slug.
 * Yesterday's problem is never repeated when there is any alternative.
 */
export function pickDaily(
  date: string,
  eligible: { id: string; slug: string }[],
  history: { problemId: string; date: string }[],
): string | null {
  if (eligible.length === 0) return null;
  const past = history.filter((h) => h.date < date);
  const count = new Map<string, number>();
  const last = new Map<string, string>();
  for (const h of past) {
    count.set(h.problemId, (count.get(h.problemId) ?? 0) + 1);
    if ((last.get(h.problemId) ?? '') < h.date) last.set(h.problemId, h.date);
  }
  const latest = past.reduce<{ problemId: string; date: string } | null>(
    (a, h) => (!a || h.date > a.date ? h : a),
    null,
  );
  const pool =
    eligible.length > 1 && latest ? eligible.filter((p) => p.id !== latest.problemId) : eligible;
  const hash = (slug: string) => createHash('sha256').update(`${date}:${slug}`).digest('hex');
  return [...pool].sort(
    (a, b) =>
      (count.get(a.id) ?? 0) - (count.get(b.id) ?? 0) ||
      (last.get(a.id) ?? '').localeCompare(last.get(b.id) ?? '') ||
      hash(a.slug).localeCompare(hash(b.slug)),
  )[0]!.id;
}

/** Spec L9 step 1: a scheduled job makes sure each track has today's daily challenge. */
@Injectable()
export class DailyService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Daily');
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onApplicationBootstrap() {
    if (this.env.NODE_ENV === 'test') return;
    const tick = () =>
      this.ensure(utcDate(new Date())).catch((err: Error) => this.logger.error(err.message));
    void tick();
    // Every 5 minutes, so a new UTC day gets its challenge right after midnight.
    this.timer = setInterval(tick, 5 * 60_000);
    this.timer.unref();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Creates the missing daily challenges for `date`. Safe to run concurrently. */
  async ensure(date: string): Promise<void> {
    const db = this.prisma.client;
    const [tracks, existing] = await Promise.all([
      db.track.findMany({ select: { id: true } }),
      db.dailyChallenge.findMany({ where: { date }, select: { trackId: true } }),
    ]);
    const done = new Set(existing.map((e) => e.trackId));
    for (const track of tracks.filter((t) => !done.has(t.id))) {
      // The queue: published, listed, practice-visible problems (publishing requires approval).
      const eligible = await db.problem.findMany({
        where: {
          trackId: track.id,
          status: 'published',
          listed: true,
          mode: { in: ['practice', 'both'] },
        },
        select: { id: true, slug: true },
      });
      const history = await db.dailyChallenge.findMany({
        where: { trackId: track.id },
        select: { problemId: true, date: true },
      });
      const problemId = pickDaily(date, eligible, history);
      if (!problemId) continue;
      await db.dailyChallenge.createMany({
        data: [{ date, trackId: track.id, problemId }],
        skipDuplicates: true,
      });
    }
  }

  /** Today's challenges, with whether `userId` solved each one today. */
  async today(userId: string | null, now = new Date()): Promise<Daily> {
    const date = utcDate(now);
    await this.ensure(date);
    const db = this.prisma.client;
    const rows = await db.dailyChallenge.findMany({
      where: { date },
      include: { track: true, problem: true },
      orderBy: { track: { order: 'asc' } },
    });
    const start = new Date(`${date}T00:00:00Z`);
    const end = new Date(start.getTime() + 86_400_000);
    const solved = new Set<string>();
    if (userId) {
      const ids = rows.map((r) => r.problemId);
      const [subs, flags] = await Promise.all([
        db.submission.findMany({
          where: {
            userId,
            problemId: { in: ids },
            kind: 'submit',
            verdict: 'accepted',
            attemptId: null,
            createdAt: { gte: start, lt: end },
          },
          select: { problemId: true },
        }),
        db.flagSubmission.findMany({
          where: {
            userId,
            problemId: { in: ids },
            correct: true,
            createdAt: { gte: start, lt: end },
          },
          select: { problemId: true },
        }),
      ]);
      for (const r of [...subs, ...flags]) solved.add(r.problemId);
    }
    return {
      date,
      resetsAt: end.toISOString(),
      items: rows.map((r) => ({
        track: r.track.slug,
        trackName: r.track.name,
        slug: r.problem.slug,
        title: r.problem.title,
        difficulty: r.problem.difficulty,
        format: r.problem.formats[0] ?? 'write-code',
        solved: solved.has(r.problemId),
      })),
    };
  }

  /** The daily challenge row if `problemId` is the daily on the UTC date of `at`. */
  isDaily(problemId: string, at: Date) {
    return this.prisma.client.dailyChallenge.findFirst({
      where: { problemId, date: utcDate(at) },
    });
  }
}
