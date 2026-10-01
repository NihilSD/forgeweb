import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type Problem, type User } from '@forge/db';
import { PLAN_LIMITS, type ProgressSummary } from '@forge/shared';
import { localDay } from '../common/time.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';
import { PrismaService } from '../infra/prisma.service.js';
import { DailyService } from './daily.service.js';
import {
  advanceStreak,
  EMPTY_STREAK,
  levelFor,
  solveXp,
  type StreakState,
  streakNow,
  XP_RULES,
} from './rules.js';

/** Spec 8: XP, levels, streaks and the daily bonus. */
@Injectable()
export class EngagementService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EntitlementsService) private readonly entitlements: EntitlementsService,
    @Inject(DailyService) private readonly daily: DailyService,
  ) {}

  private get db() {
    return this.prisma.client;
  }

  /** Awards XP once per `sourceKey`. Returns false if it was already awarded. */
  async award(
    userId: string,
    amount: number,
    reason: 'solve' | 'lesson' | 'daily',
    sourceKey: string,
    at: Date,
  ): Promise<boolean> {
    if (amount <= 0) return false;
    try {
      await this.db.xpEvent.create({ data: { userId, amount, reason, sourceKey, at } });
      return true;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return false;
      throw err;
    }
  }

  private async freezesPerMonth(userId: string) {
    return PLAN_LIMITS[await this.entitlements.plan(userId)].streakFreezesPerMonth;
  }

  /** A day counts with one solved problem or lesson, in the user's time zone. */
  async recordActivity(userId: string, at: Date): Promise<void> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: { timeZone: true },
    });
    if (!user) return;
    const day = localDay(at, user.timeZone);
    const perMonth = await this.freezesPerMonth(userId);
    await this.db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`streak:${userId}`}))`;
      const row = await tx.streak.findUnique({ where: { userId } });
      const state: StreakState = row ?? EMPTY_STREAK;
      const next = advanceStreak(state, day, perMonth);
      if (next === state && row) return;
      const data = {
        current: next.current,
        longest: next.longest,
        lastDay: next.lastDay,
        freezeMonth: next.freezeMonth,
        freezesUsed: next.freezesUsed,
        frozenDays: next.frozenDays,
      };
      await tx.streak.upsert({ where: { userId }, create: { userId, ...data }, update: data });
    });
  }

  /** First practice solve (from PracticeService): solve XP, reduced by hint levels used. */
  async onFirstSolve(userId: string, problem: Problem, hintsUsed: number, at: Date) {
    await this.award(
      userId,
      solveXp(problem.difficulty, hintsUsed),
      'solve',
      `solve:${problem.id}`,
      at,
    );
  }

  /** Any accepted practice submit or correct flag: streak day and the daily bonus. */
  async onSolved(userId: string, problemId: string, at: Date, opts: { practice: boolean }) {
    await this.recordActivity(userId, at);
    if (!opts.practice) return;
    const daily = await this.daily.isDaily(problemId, at);
    if (daily)
      await this.award(userId, XP_RULES.daily, 'daily', `daily:${daily.date}:${daily.trackId}`, at);
  }

  /** A correct flag: flags have no hint-tracking hook, so the first solve is awarded here. */
  async onFlagSolved(userId: string, problem: Problem, at: Date) {
    const hintsUsed = await this.db.hintUse.count({ where: { userId, problemId: problem.id } });
    await this.onFirstSolve(userId, problem, hintsUsed, at);
    await this.onSolved(userId, problem.id, at, { practice: true });
  }

  async onLessonCompleted(userId: string, lessonId: string, at: Date) {
    await this.award(userId, XP_RULES.lesson, 'lesson', `lesson:${lessonId}`, at);
    await this.recordActivity(userId, at);
  }

  async progress(user: User, now = new Date()): Promise<ProgressSummary> {
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
    const [total, week, streak, solvedSubs, solvedFlags, verified, lessons, placement, perMonth] =
      await Promise.all([
        this.db.xpEvent.aggregate({ where: { userId: user.id }, _sum: { amount: true } }),
        this.db.xpEvent.aggregate({
          where: { userId: user.id, at: { gte: weekAgo } },
          _sum: { amount: true },
        }),
        this.db.streak.findUnique({ where: { userId: user.id } }),
        this.db.submission.findMany({
          where: { userId: user.id, kind: 'submit', verdict: 'accepted', attemptId: null },
          distinct: ['problemId'],
          select: { problemId: true },
        }),
        this.db.flagSubmission.findMany({
          where: { userId: user.id, correct: true },
          distinct: ['problemId'],
          select: { problemId: true },
        }),
        this.db.attempt.count({ where: { userId: user.id, status: 'verified' } }),
        this.db.lessonProgress.count({ where: { userId: user.id } }),
        this.db.placementResult.findUnique({ where: { userId: user.id } }),
        this.freezesPerMonth(user.id),
      ]);
    const xp = total._sum.amount ?? 0;
    const lvl = levelFor(xp);
    const now_ = streakNow(streak ?? EMPTY_STREAK, localDay(now, user.timeZone), perMonth);
    return {
      xp,
      level: lvl.level,
      levelXp: lvl.levelXp,
      nextLevelXp: lvl.nextLevelXp,
      xpThisWeek: week._sum.amount ?? 0,
      streak: { ...now_, freezesPerMonth: perMonth },
      solved: new Set([...solvedSubs, ...solvedFlags].map((r) => r.problemId)).size,
      verified,
      lessonsCompleted: lessons,
      placement: placement ? (placement.skipped ? 'skipped' : 'taken') : 'none',
    };
  }
}
