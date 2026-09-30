import { Controller, Get, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import type { User } from '@forge/db';
import { lessonBlocks } from '@forge/problem-kit';
import { courseDetailSchema, courseListSchema, ErrorCode, lessonSchema } from '@forge/shared';
import { z } from 'zod';
import { ApiError } from '../common/api-error.js';
import { CurrentUser, type ForgeRequest, Public } from '../common/request-context.js';
import { ResponseSchema } from '../common/response-schema.js';
import { ZodPipe } from '../common/zod.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';
import { PrismaService } from '../infra/prisma.service.js';
import { SolvedService } from '../problems/solved.service.js';

const slugSchema = z.string().regex(/^[a-z0-9-]{1,80}$/);

export interface CourseHooks {
  onLessonCompleted?: (userId: string, lessonId: string, at: Date) => Promise<void>;
}

@Controller('courses')
export class CoursesController {
  readonly hooks: CourseHooks[] = [];

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EntitlementsService) private readonly entitlements: EntitlementsService,
    @Inject(SolvedService) private readonly solved: SolvedService,
  ) {}

  private async completedIds(userId: string | undefined) {
    if (!userId) return new Set<string>();
    const rows = await this.prisma.client.lessonProgress.findMany({
      where: { userId },
      select: { lessonId: true },
    });
    return new Set(rows.map((r) => r.lessonId));
  }

  private async course(slug: string) {
    const course = await this.prisma.client.course.findUnique({
      where: { slug },
      include: { lessons: { orderBy: { order: 'asc' } } },
    });
    if (!course || course.status !== 'published') throw ApiError.notFound('Course');
    return course;
  }

  @Public()
  @Get()
  @ResponseSchema(courseListSchema)
  async list(@Req() req: ForgeRequest) {
    const courses = await this.prisma.client.course.findMany({
      where: { status: 'published' },
      include: { lessons: { select: { id: true } } },
      orderBy: { order: 'asc' },
    });
    const done = await this.completedIds(req.auth?.user.id);
    return {
      items: courses.map((c) => ({
        slug: c.slug,
        title: c.title,
        description: c.description,
        topic: c.topic,
        kind: c.kind === 'patterns' ? ('patterns' as const) : ('course' as const),
        lessonCount: c.lessons.length,
        completedCount: c.lessons.filter((l) => done.has(l.id)).length,
      })),
    };
  }

  @Public()
  @Get(':slug')
  @ResponseSchema(courseDetailSchema)
  async detail(@Param('slug', new ZodPipe(slugSchema)) slug: string, @Req() req: ForgeRequest) {
    const c = await this.course(slug);
    const userId = req.auth?.user.id ?? null;
    const done = await this.completedIds(userId ?? undefined);
    const lessons = await Promise.all(
      c.lessons.map(async (l) => ({
        slug: l.slug,
        title: l.title,
        order: l.order,
        completed: done.has(l.id),
        locked: !(await this.entitlements.lessonUnlocked(userId, l.order)),
      })),
    );
    return {
      slug: c.slug,
      title: c.title,
      description: c.description,
      topic: c.topic,
      kind: c.kind === 'patterns' ? ('patterns' as const) : ('course' as const),
      lessonCount: lessons.length,
      completedCount: lessons.filter((l) => l.completed).length,
      lessons,
    };
  }

  private async lessonFor(slug: string, lessonSlug: string, userId: string | null) {
    const c = await this.course(slug);
    const idx = c.lessons.findIndex((l) => l.slug === lessonSlug);
    const lesson = c.lessons[idx];
    if (!lesson) throw ApiError.notFound('Lesson');
    if (!(await this.entitlements.lessonUnlocked(userId, lesson.order))) {
      throw new ApiError(
        ErrorCode.PLAN_REQUIRED,
        'This lesson is part of Forge Pro. The first lessons of every course are free.',
        {
          feature: 'all_lessons',
        },
      );
    }
    return { c, lesson, idx };
  }

  @Public()
  @Get(':slug/lessons/:lesson')
  @ResponseSchema(lessonSchema)
  async lesson(
    @Param('slug', new ZodPipe(slugSchema)) slug: string,
    @Param('lesson', new ZodPipe(slugSchema)) lessonSlug: string,
    @Req() req: ForgeRequest,
  ) {
    const userId = req.auth?.user.id ?? null;
    const { c, lesson, idx } = await this.lessonFor(slug, lessonSlug, userId);
    const { exercises } = lessonBlocks(lesson.body);
    const problems = await this.prisma.client.problem.findMany({
      where: { slug: { in: exercises } },
      select: { id: true, slug: true },
    });
    const solved = userId ? await this.solved.solvedProblemIds(userId) : new Set<string>();
    const done = await this.completedIds(userId ?? undefined);
    return {
      courseSlug: c.slug,
      courseTitle: c.title,
      slug: lesson.slug,
      title: lesson.title,
      order: lesson.order,
      concepts: lesson.concepts,
      body: lesson.body,
      completed: done.has(lesson.id),
      exercises: exercises.map((e) => ({
        slug: e,
        solved: solved.has(problems.find((p) => p.slug === e)?.id ?? ''),
      })),
      next: c.lessons[idx + 1]?.slug ?? null,
      previous: c.lessons[idx - 1]?.slug ?? null,
    };
  }

  @Post(':slug/lessons/:lesson/complete')
  @HttpCode(200)
  @ResponseSchema(lessonSchema)
  async complete(
    @Param('slug', new ZodPipe(slugSchema)) slug: string,
    @Param('lesson', new ZodPipe(slugSchema)) lessonSlug: string,
    @CurrentUser() user: User,
    @Req() req: ForgeRequest,
  ) {
    const { lesson } = await this.lessonFor(slug, lessonSlug, user.id);
    const view = await this.lesson(slug, lessonSlug, req);
    const unsolved = view.exercises.filter((e) => !e.solved);
    if (unsolved.length) {
      throw new ApiError(
        ErrorCode.CONFLICT,
        'Solve the lesson exercise first, then mark the lesson complete.',
        {
          exercises: unsolved.map((e) => e.slug),
        },
      );
    }
    const now = new Date();
    const created = await this.prisma.client.lessonProgress
      .create({ data: { userId: user.id, lessonId: lesson.id, completedAt: now } })
      .then(() => true)
      .catch(() => false); // already completed
    if (created) for (const h of this.hooks) await h.onLessonCompleted?.(user.id, lesson.id, now);
    return { ...view, completed: true };
  }
}
