import { z } from 'zod';
import { FEATURES, PLANS } from '../plans.js';

export const hintLevelSchema = z.object({
  level: z.number().int().min(1).max(4),
  name: z.enum(['nudge', 'approach', 'pseudocode', 'solution']),
  revealed: z.boolean(),
  text: z.string().optional(),
});
export const hintsSchema = z.object({
  levels: z.array(hintLevelSchema),
  /** Hint levels still available today; null = unlimited. */
  remainingToday: z.number().nullable(),
});
export type Hints = z.infer<typeof hintsSchema>;

export const editorialSchema = z.object({ markdown: z.string() });

export const progressSchema = z.object({
  solved: z.boolean(),
  gaveUp: z.boolean(),
  bookmarked: z.boolean(),
  note: z.string(),
  hintsUsed: z.number(),
  editorialAvailable: z.boolean(),
});
export type Progress = z.infer<typeof progressSchema>;

export const noteSchema = z.object({ text: z.string().max(10_000) });

export const masteryItemSchema = z.object({
  tag: z.string(),
  level: z.number().int().min(0).max(5),
  points: z.number(),
  lastPracticed: z.string().nullable(),
});
export const masterySchema = z.object({ items: z.array(masteryItemSchema) });
export type MasteryItem = z.infer<typeof masteryItemSchema>;

export const reviewItemSchema = z.object({
  slug: z.string(),
  title: z.string(),
  stage: z.number(),
  dueAt: z.string(),
  due: z.boolean(),
});
export const reviewQueueSchema = z.object({ items: z.array(reviewItemSchema) });

export const recommendationSchema = z.object({
  slug: z.string(),
  title: z.string(),
  difficulty: z.string(),
  reason: z.string(),
});
export const recommendationsSchema = z.object({ items: z.array(recommendationSchema) });
export type Recommendation = z.infer<typeof recommendationSchema>;

export const bookmarkListSchema = z.object({
  items: z.array(
    z.object({
      slug: z.string(),
      title: z.string(),
      difficulty: z.string(),
      createdAt: z.string(),
    }),
  ),
});

export const entitlementsSchema = z.object({
  plan: z.enum(PLANS),
  features: z.array(z.enum(FEATURES)),
  hintLevelsPerDay: z.number().nullable(),
  verifiedPerWeek: z.number().nullable(),
  streakFreezesPerMonth: z.number(),
});
export type Entitlements = z.infer<typeof entitlementsSchema>;

export const courseSummarySchema = z.object({
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  topic: z.string(),
  kind: z.enum(['course', 'patterns']),
  lessonCount: z.number(),
  completedCount: z.number(),
});
export const courseListSchema = z.object({ items: z.array(courseSummarySchema) });

export const lessonSummarySchema = z.object({
  slug: z.string(),
  title: z.string(),
  order: z.number(),
  completed: z.boolean(),
  locked: z.boolean(),
});
export const courseDetailSchema = courseSummarySchema.extend({
  lessons: z.array(lessonSummarySchema),
});

export const lessonSchema = z.object({
  courseSlug: z.string(),
  courseTitle: z.string(),
  slug: z.string(),
  title: z.string(),
  order: z.number(),
  concepts: z.array(z.string()),
  body: z.string(),
  completed: z.boolean(),
  /** Exercise problem slugs referenced by the lesson, with solved state. */
  exercises: z.array(z.object({ slug: z.string(), solved: z.boolean() })),
  next: z.string().nullable(),
  previous: z.string().nullable(),
});
export type Lesson = z.infer<typeof lessonSchema>;
