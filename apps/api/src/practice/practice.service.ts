import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Prisma, Problem, Submission, User } from '@forge/db';
import {
  CONCEPT_TAGS,
  type Difficulty,
  ErrorCode,
  HINT_XP_PENALTY,
  type Hints,
  type Progress,
  type Recommendation,
  REVIEW_INTERVALS_DAYS,
} from '@forge/shared';
import { ApiError } from '../common/api-error.js';
import { DAY_MS, localDay } from '../common/time.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';
import { PrismaService } from '../infra/prisma.service.js';
import { SolvedService } from '../problems/solved.service.js';

const HINT_NAMES = ['nudge', 'approach', 'pseudocode', 'solution'] as const;
/** Mastery points per first solve, by difficulty; 20 points = one level (max 5). */
const MASTERY_POINTS: Record<Difficulty, number> = { easy: 10, medium: 20, hard: 30, expert: 40 };
const POINTS_PER_LEVEL = 20;
const MAX_POINTS = 5 * POINTS_PER_LEVEL;
/** A solve counts as a struggle (review queue) after this many failed submits or hint levels. */
const STRUGGLE_FAILS = 3;
const STRUGGLE_HINTS = 2;

export interface PracticeHooks {
  /** Called on a first practice solve (XP, streaks, daily challenge: phase L9). */
  onSolved?: (
    userId: string,
    problem: Problem,
    info: { hintsUsed: number; at: Date },
  ) => Promise<void>;
}

@Injectable()
export class PracticeService {
  private readonly logger = new Logger('Practice');
  readonly hooks: PracticeHooks[] = [];

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EntitlementsService) private readonly entitlements: EntitlementsService,
    @Inject(SolvedService) private readonly solved: SolvedService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  // ------------------------------------------------------------------ hints

  async hints(user: User, problem: Problem & { hintTexts: string[] }): Promise<Hints> {
    const [used, limits] = await Promise.all([
      this.db.hintUse.findMany({ where: { userId: user.id, problemId: problem.id } }),
      this.entitlements.get(user.id),
    ]);
    const revealed = new Set(used.map((u) => u.level));
    let remainingToday: number | null = null;
    if (limits.hintLevelsPerDay !== null) {
      const today = await this.db.hintUse.count({
        where: { userId: user.id, day: localDay(new Date(), user.timeZone) },
      });
      remainingToday = Math.max(0, limits.hintLevelsPerDay - today);
    }
    return {
      levels: HINT_NAMES.map((name, i) => ({
        level: i + 1,
        name,
        revealed: revealed.has(i + 1),
        ...(revealed.has(i + 1) ? { text: problem.hintTexts[i] ?? '' } : {}),
      })),
      remainingToday,
    };
  }

  async revealHint(
    user: User,
    problem: Problem & { hintTexts: string[] },
    level: number,
  ): Promise<Hints> {
    const used = await this.db.hintUse.findMany({
      where: { userId: user.id, problemId: problem.id },
    });
    if (used.some((u) => u.level === level)) return this.hints(user, problem);
    if (level !== used.length + 1) {
      throw new ApiError(ErrorCode.BAD_REQUEST, 'Reveal hints in order, starting with the nudge.');
    }
    const current = await this.hints(user, problem);
    if (current.remainingToday !== null && current.remainingToday <= 0) {
      throw new ApiError(
        ErrorCode.LIMIT_REACHED,
        "You have used today's free hints. They reset tomorrow, or upgrade to Pro for unlimited hints.",
        { feature: 'unlimited_hints' },
      );
    }
    await this.db.hintUse
      .create({
        data: {
          userId: user.id,
          problemId: problem.id,
          level,
          day: localDay(new Date(), user.timeZone),
        },
      })
      .catch(() => undefined); // a concurrent duplicate reveal is harmless
    return this.hints(user, problem);
  }

  // ------------------------------------------------------------------ progress

  async progress(user: User, problemId: string): Promise<Progress> {
    const [p, bookmark, note, hintsUsed, solvedIds] = await Promise.all([
      this.db.problemProgress.findUnique({
        where: { userId_problemId: { userId: user.id, problemId } },
      }),
      this.db.bookmark.findUnique({ where: { userId_problemId: { userId: user.id, problemId } } }),
      this.db.note.findUnique({ where: { userId_problemId: { userId: user.id, problemId } } }),
      this.db.hintUse.count({ where: { userId: user.id, problemId } }),
      this.solved.solvedProblemIds(user.id),
    ]);
    const solved = solvedIds.has(problemId);
    return {
      solved,
      gaveUp: Boolean(p?.gaveUpAt),
      bookmarked: Boolean(bookmark),
      note: note?.text ?? '',
      hintsUsed,
      editorialAvailable:
        (solved || Boolean(p?.gaveUpAt)) && (await this.entitlements.has(user.id, 'editorials')),
    };
  }

  async editorial(user: User, problem: Problem, markdown: string): Promise<{ markdown: string }> {
    await this.entitlements.require(user.id, 'editorials', 'Editorials');
    const progress = await this.progress(user, problem.id);
    if (!progress.solved && !progress.gaveUp) {
      throw ApiError.forbidden('The editorial unlocks when you solve the problem or give up.');
    }
    return { markdown };
  }

  async giveUp(user: User, problem: Problem, at = new Date()) {
    await this.db.problemProgress.upsert({
      where: { userId_problemId: { userId: user.id, problemId: problem.id } },
      create: { userId: user.id, problemId: problem.id, gaveUpAt: at },
      update: { gaveUpAt: at },
    });
    await this.scheduleReview(user.id, problem.id, at);
  }

  // ------------------------------------------------------------------ submissions → mastery/review

  /** Runs after every finished submission (hooked into SubmissionsService). */
  async onSubmissionFinished(sub: Submission, at = sub.finishedAt ?? new Date()) {
    if (sub.kind !== 'submit' || sub.attemptId || !sub.verdict || sub.verdict === 'internal_error')
      return;
    const key = { userId_problemId: { userId: sub.userId, problemId: sub.problemId } };
    if (sub.verdict !== 'accepted') {
      await this.db.problemProgress.upsert({
        where: key,
        create: { userId: sub.userId, problemId: sub.problemId, failedSubmits: 1 },
        update: { failedSubmits: { increment: 1 } },
      });
      return;
    }
    const existing = await this.db.problemProgress.findUnique({ where: key });
    if (existing?.solvedAt) {
      await this.advanceReview(sub.userId, sub.problemId, at);
      return;
    }
    const hintsUsed = await this.db.hintUse.count({
      where: { userId: sub.userId, problemId: sub.problemId },
    });
    // Claim the first solve atomically so concurrent callbacks can't double-count.
    const claimed = await this.db.problemProgress.updateMany({
      where: { userId: sub.userId, problemId: sub.problemId, solvedAt: null },
      data: { solvedAt: at, hintsAtSolve: hintsUsed },
    });
    if (claimed.count === 0) {
      try {
        await this.db.problemProgress.create({
          data: {
            userId: sub.userId,
            problemId: sub.problemId,
            solvedAt: at,
            hintsAtSolve: hintsUsed,
          },
        });
      } catch {
        return; // another callback won the race
      }
    }
    const problem = await this.db.problem.findUniqueOrThrow({ where: { id: sub.problemId } });
    await this.addMastery(sub.userId, problem, hintsUsed, at);
    const struggled =
      (existing?.failedSubmits ?? 0) >= STRUGGLE_FAILS ||
      hintsUsed >= STRUGGLE_HINTS ||
      Boolean(existing?.gaveUpAt);
    if (struggled) await this.scheduleReview(sub.userId, sub.problemId, at);
    else await this.advanceReview(sub.userId, sub.problemId, at);
    for (const h of this.hooks) {
      await h
        .onSolved?.(sub.userId, problem, { hintsUsed, at })
        .catch((err: Error) => this.logger.error(err.message));
    }
  }

  private async addMastery(userId: string, problem: Problem, hintsUsed: number, at: Date) {
    const base = MASTERY_POINTS[problem.difficulty];
    const points = Math.max(1, Math.round(base * Math.max(0, 1 - HINT_XP_PENALTY * hintsUsed)));
    for (const tag of problem.tags) {
      const current = await this.db.mastery.findUnique({ where: { userId_tag: { userId, tag } } });
      const total = Math.min(MAX_POINTS, (current?.points ?? 0) + points);
      const data = {
        points: total,
        level: Math.min(5, Math.floor(total / POINTS_PER_LEVEL)),
        lastPracticed: at,
      };
      await this.db.mastery.upsert({
        where: { userId_tag: { userId, tag } },
        create: { userId, tag, ...data },
        update: data,
      });
    }
  }

  private async scheduleReview(userId: string, problemId: string, at: Date) {
    const dueAt = new Date(at.getTime() + REVIEW_INTERVALS_DAYS[0] * DAY_MS);
    await this.db.reviewItem.upsert({
      where: { userId_problemId: { userId, problemId } },
      create: { userId, problemId, stage: 0, dueAt },
      // A new struggle restarts the schedule.
      update: { stage: 0, dueAt, completedAt: null },
    });
  }

  /** A solve at or after the due date moves the item to the next interval (2 → 7 → 21 → done). */
  private async advanceReview(userId: string, problemId: string, at: Date) {
    const item = await this.db.reviewItem.findUnique({
      where: { userId_problemId: { userId, problemId } },
    });
    if (!item || item.stage >= REVIEW_INTERVALS_DAYS.length || item.dueAt > at) return;
    const stage = item.stage + 1;
    const next = REVIEW_INTERVALS_DAYS[stage];
    await this.db.reviewItem.update({
      where: { id: item.id },
      data:
        next === undefined
          ? { stage, completedAt: at }
          : { stage, dueAt: new Date(at.getTime() + next * DAY_MS) },
    });
  }

  // ------------------------------------------------------------------ views

  async mastery(userId: string) {
    const rows = await this.db.mastery.findMany({ where: { userId } });
    const byTag = new Map(rows.map((r) => [r.tag, r]));
    return {
      items: CONCEPT_TAGS.map((tag) => {
        const r = byTag.get(tag);
        return {
          tag,
          level: r?.level ?? 0,
          points: r?.points ?? 0,
          lastPracticed: r?.lastPracticed?.toISOString() ?? null,
        };
      }),
    };
  }

  async reviewQueue(userId: string, now = new Date()) {
    await this.entitlements.require(userId, 'review_queue', 'The review queue');
    const rows = await this.db.reviewItem.findMany({
      where: { userId, completedAt: null },
      include: { problem: true },
      orderBy: { dueAt: 'asc' },
      take: 100,
    });
    return {
      items: rows.map((r) => ({
        slug: r.problem.slug,
        title: r.problem.title,
        stage: r.stage,
        dueAt: r.dueAt.toISOString(),
        due: r.dueAt <= now,
      })),
    };
  }

  /** "Next best problem" (spec L6): due reviews first, then the weakest concepts. */
  async recommendations(user: User, now = new Date()): Promise<{ items: Recommendation[] }> {
    const out: Recommendation[] = [];
    if (await this.entitlements.has(user.id, 'review_queue')) {
      const due = await this.db.reviewItem.findMany({
        where: { userId: user.id, completedAt: null, dueAt: { lte: now } },
        include: { problem: true },
        orderBy: { dueAt: 'asc' },
        take: 2,
      });
      for (const r of due) {
        out.push({
          slug: r.problem.slug,
          title: r.problem.title,
          difficulty: r.problem.difficulty,
          reason: 'Due for review',
        });
      }
    }
    const [solved, mastery, candidates] = await Promise.all([
      this.solved.solvedProblemIds(user.id),
      this.db.mastery.findMany({ where: { userId: user.id } }),
      this.db.problem.findMany({
        where: { status: 'published', listed: true, mode: { not: 'competitive' } },
        select: {
          id: true,
          slug: true,
          title: true,
          difficulty: true,
          tags: true,
          languages: true,
          rating: true,
        },
        take: 500,
      }),
    ]);
    const level = new Map(mastery.map((m) => [m.tag, m.level]));
    const avg = mastery.length ? mastery.reduce((a, m) => a + m.level, 0) / mastery.length : 0;
    const targetRating = 1000 + avg * 250;
    const inQueue = new Set(out.map((o) => o.slug));
    const scored = candidates
      .filter((p) => !solved.has(p.id) && !inQueue.has(p.slug))
      .map((p) => {
        const weakest = p.tags.reduce((min, t) => Math.min(min, level.get(t) ?? 0), 5);
        const weakTag = p.tags.find((t) => (level.get(t) ?? 0) === weakest) ?? p.tags[0] ?? '';
        const langFit =
          user.languages.length === 0 || p.languages.some((l) => user.languages.includes(l))
            ? 0
            : 2;
        const score = weakest * 3 + Math.abs(p.rating - targetRating) / 400 + langFit;
        return { p, score, weakTag, weakest };
      })
      .sort((a, b) => a.score - b.score || a.p.slug.localeCompare(b.p.slug));
    for (const { p, weakTag, weakest } of scored.slice(0, 5 - out.length)) {
      out.push({
        slug: p.slug,
        title: p.title,
        difficulty: p.difficulty,
        reason: `Practise ${weakTag} (your level: ${weakest})`,
      });
    }
    return { items: out };
  }

  async bookmarks(userId: string) {
    const rows = await this.db.bookmark.findMany({
      where: { userId },
      include: { problem: true },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return {
      items: rows.map((b) => ({
        slug: b.problem.slug,
        title: b.problem.title,
        difficulty: b.problem.difficulty,
        createdAt: b.createdAt.toISOString(),
      })),
    };
  }

  async setBookmark(userId: string, problemId: string, on: boolean) {
    if (on) {
      await this.db.bookmark.upsert({
        where: { userId_problemId: { userId, problemId } },
        create: { userId, problemId },
        update: {},
      });
    } else {
      await this.db.bookmark.deleteMany({ where: { userId, problemId } });
    }
  }

  async setNote(userId: string, problemId: string, text: string) {
    const data: Prisma.NoteUncheckedCreateInput = { userId, problemId, text };
    if (text.trim() === '') await this.db.note.deleteMany({ where: { userId, problemId } });
    else
      await this.db.note.upsert({
        where: { userId_problemId: { userId, problemId } },
        create: data,
        update: { text },
      });
  }
}
