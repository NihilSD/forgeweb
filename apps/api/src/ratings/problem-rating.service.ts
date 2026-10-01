import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@forge/db';
import { rate } from '@forge/shared';
import { PrismaService } from '../infra/prisma.service.js';

/** ISO-8601 week, e.g. "2026-W40" (weeks start on Monday, UTC). */
export function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const year = t.getUTCFullYear();
  const week = Math.ceil(((t.getTime() - Date.UTC(year, 0, 1)) / 86_400_000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/**
 * Spec 8: problem ratings start from difficulty and are recalculated weekly from verified
 * results. Each problem is a Glicko-2 "player" for one rating period: every rated attempt since
 * the last run is a game against the solver's rating at that time, which the problem wins when
 * the solver ran out of time. Problems without rated attempts keep their rating and RD.
 */
@Injectable()
export class ProblemRatingService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Runs once per ISO week; later calls in the same week return `{ ran: false }`. */
  async run(now = new Date()): Promise<{ ran: boolean; week: string; updated: number }> {
    const week = isoWeek(now);
    const db = this.prisma.client;
    try {
      return await db.$transaction(
        async (tx) => {
          const last = await tx.problemRatingRun.findFirst({ orderBy: { createdAt: 'desc' } });
          await tx.problemRatingRun.create({ data: { week, updated: 0 } });
          const since = last?.createdAt ?? new Date(now.getTime() - 7 * 86_400_000);
          const changes = await tx.ratingChange.findMany({
            where: { problemId: { not: null }, at: { gt: since, lte: now } },
            select: { problemId: true, score: true, ratingBefore: true, rdBefore: true },
          });
          const byProblem = new Map<string, typeof changes>();
          for (const c of changes) {
            const list = byProblem.get(c.problemId!) ?? [];
            list.push(c);
            byProblem.set(c.problemId!, list);
          }
          for (const [problemId, games] of byProblem) {
            const p = await tx.problem.findUniqueOrThrow({ where: { id: problemId } });
            const next = rate(
              { rating: p.rating, rd: p.ratingDeviation, volatility: p.ratingVolatility },
              games.map((g) => ({
                opponent: { rating: g.ratingBefore, rd: g.rdBefore },
                score: 1 - g.score,
              })),
            );
            await tx.problem.update({
              where: { id: problemId },
              data: {
                rating: Math.round(next.rating),
                ratingDeviation: next.rd,
                ratingVolatility: next.volatility,
              },
            });
          }
          await tx.problemRatingRun.update({ where: { week }, data: { updated: byProblem.size } });
          return { ran: true, week, updated: byProblem.size };
        },
        { timeout: 60_000 },
      );
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return { ran: false, week, updated: 0 };
      }
      throw err;
    }
  }
}
