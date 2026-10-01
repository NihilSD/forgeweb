import { z } from 'zod';

export const progressSummarySchema = z.object({
  xp: z.number(),
  level: z.number(),
  levelXp: z.number(),
  nextLevelXp: z.number(),
  xpThisWeek: z.number(),
  streak: z.object({
    current: z.number(),
    longest: z.number(),
    activeToday: z.boolean(),
    freezesLeft: z.number(),
    freezesPerMonth: z.number(),
  }),
  solved: z.number(),
  verified: z.number(),
  lessonsCompleted: z.number(),
  placement: z.enum(['none', 'taken', 'skipped']),
});
export type ProgressSummary = z.infer<typeof progressSummarySchema>;

export const dailyItemSchema = z.object({
  track: z.string(),
  trackName: z.string(),
  slug: z.string(),
  title: z.string(),
  difficulty: z.string(),
  format: z.string(),
  /** Whether the signed-in user solved it today (UTC date of the challenge). */
  solved: z.boolean(),
});
export const dailySchema = z.object({
  /** UTC date, YYYY-MM-DD. The daily challenge changes at midnight UTC. */
  date: z.string(),
  resetsAt: z.string(),
  items: z.array(dailyItemSchema),
});
export type Daily = z.infer<typeof dailySchema>;

export const placementQuizSchema = z.object({
  status: z.enum(['none', 'taken', 'skipped']),
  questions: z.array(
    z.object({ id: z.string(), tag: z.string(), prompt: z.string(), options: z.array(z.string()) }),
  ),
});
export type PlacementQuiz = z.infer<typeof placementQuizSchema>;

export const placementAnswersSchema = z.object({
  /** Question id → chosen option index. */
  answers: z.record(z.string().max(64), z.number().int().min(0).max(9)),
});

export const placementResultSchema = z.object({
  score: z.number(),
  total: z.number(),
  tags: z.array(z.object({ tag: z.string(), correct: z.boolean() })),
});

export const unsubscribeQuerySchema = z.object({
  token: z.string().regex(/^[0-9a-f-]{36}\.[A-Za-z0-9_-]{20,}$/),
});
