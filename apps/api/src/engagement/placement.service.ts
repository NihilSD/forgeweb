import { existsSync } from 'node:fs';
import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type PrismaClient, type User } from '@forge/db';
import { loadPlacement } from '@forge/problem-kit';
import { ErrorCode, type PlacementQuiz } from '@forge/shared';
import { ApiError } from '../common/api-error.js';
import { PrismaService } from '../infra/prisma.service.js';

/** Mastery points for a correct placement answer: one level (spec 8: 20 points per level). */
export const PLACEMENT_POINTS = 20;

/**
 * Imports content/placement/quiz.yaml. Questions are served only when the quiz is approved (or when
 * drafts are published for development and tests, like problems).
 */
export async function importPlacement(
  db: PrismaClient,
  file: string,
  opts: { publishDrafts?: boolean } = {},
): Promise<number> {
  if (!existsSync(file)) return 0;
  const quiz = await loadPlacement(file);
  const published = quiz.status === 'approved' || Boolean(opts.publishDrafts);
  await db.$transaction([
    db.placementQuestion.deleteMany({ where: { id: { notIn: quiz.questions.map((q) => q.id) } } }),
    ...quiz.questions.map((q, order) =>
      db.placementQuestion.upsert({
        where: { id: q.id },
        create: {
          id: q.id,
          order,
          tag: q.tag,
          prompt: q.prompt,
          options: q.options,
          answer: q.answer,
          published,
        },
        update: {
          order,
          tag: q.tag,
          prompt: q.prompt,
          options: q.options,
          answer: q.answer,
          published,
        },
      }),
    ),
  ]);
  return quiz.questions.length;
}

/** Spec L9 step 3: a short placement quiz that sets starting mastery. Taken (or skipped) once. */
@Injectable()
export class PlacementService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma.client;
  }

  private async status(userId: string): Promise<PlacementQuiz['status']> {
    const r = await this.db.placementResult.findUnique({ where: { userId } });
    return r ? (r.skipped ? 'skipped' : 'taken') : 'none';
  }

  async quiz(user: User): Promise<PlacementQuiz> {
    const questions = await this.db.placementQuestion.findMany({
      where: { published: true },
      orderBy: { order: 'asc' },
    });
    return {
      status: await this.status(user.id),
      // The answer index never leaves the server.
      questions: questions.map((q) => ({
        id: q.id,
        tag: q.tag,
        prompt: q.prompt,
        options: q.options,
      })),
    };
  }

  async submit(user: User, answers: Record<string, number>) {
    const questions = await this.db.placementQuestion.findMany({
      where: { published: true },
      orderBy: { order: 'asc' },
    });
    if (questions.length === 0) throw ApiError.notFound('Placement quiz');
    const graded = questions.map((q) => ({ tag: q.tag, correct: answers[q.id] === q.answer }));
    const score = graded.filter((g) => g.correct).length;
    try {
      await this.db.placementResult.create({
        data: { userId: user.id, score, total: questions.length, answers },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
        throw new ApiError(ErrorCode.CONFLICT, 'You have already taken the placement quiz.');
      throw err;
    }
    // Starting mastery: never lowers what the user has already earned.
    for (const tag of new Set(graded.filter((g) => g.correct).map((g) => g.tag))) {
      const existing = await this.db.mastery.findUnique({
        where: { userId_tag: { userId: user.id, tag } },
      });
      const points = Math.max(existing?.points ?? 0, PLACEMENT_POINTS);
      await this.db.mastery.upsert({
        where: { userId_tag: { userId: user.id, tag } },
        create: { userId: user.id, tag, points, level: Math.floor(points / 20) },
        update: { points, level: Math.floor(points / 20) },
      });
    }
    return { score, total: questions.length, tags: graded };
  }

  async skip(user: User) {
    await this.db.placementResult.createMany({
      data: [{ userId: user.id, skipped: true }],
      skipDuplicates: true,
    });
  }
}
