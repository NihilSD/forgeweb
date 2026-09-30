import { z } from 'zod';
import { CONCEPT_TAGS, DIFFICULTIES, LANGUAGES, TRACK_SLUGS } from '../constants.js';

export const problemListQuerySchema = z.object({
  track: z.enum(TRACK_SLUGS).optional(),
  difficulty: z.enum(DIFFICULTIES).optional(),
  tag: z.enum(CONCEPT_TAGS).optional(),
  q: z.string().trim().max(100).optional(),
  status: z.enum(['solved', 'unsolved']).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type ProblemListQuery = z.infer<typeof problemListQuerySchema>;

export const problemSummarySchema = z.object({
  slug: z.string(),
  title: z.string(),
  track: z.string(),
  difficulty: z.enum(DIFFICULTIES),
  rating: z.number(),
  tags: z.array(z.string()),
  formats: z.array(z.string()),
  languages: z.array(z.string()),
  mode: z.enum(['practice', 'competitive', 'both']),
  solved: z.boolean(),
});
export type ProblemSummary = z.infer<typeof problemSummarySchema>;

export const problemListSchema = z.object({
  items: z.array(problemSummarySchema),
  nextCursor: z.string().nullable(),
});

export const visibleTestSchema = z.object({
  id: z.string(),
  category: z.string(),
  args: z.array(z.unknown()).optional(),
  setupSql: z.string().optional(),
  expected: z.unknown(),
});
export type VisibleTest = z.infer<typeof visibleTestSchema>;

export const problemDetailSchema = problemSummarySchema.extend({
  version: z.number(),
  format: z.string(),
  statement: z.string(),
  limits: z.object({ timeMs: z.number(), memoryMb: z.number(), outputKb: z.number() }),
  entry: z.record(z.string(), z.string()).nullable(),
  starters: z.record(z.string(), z.string()),
  visibleTests: z.array(visibleTestSchema),
  hiddenTestCount: z.number(),
  hintCount: z.number(),
  files: z.array(z.string()),
  verifiedMinutes: z.number(),
});
export type ProblemDetail = z.infer<typeof problemDetailSchema>;

export const trackSchema = z.object({
  slug: z.string(),
  name: z.string(),
  order: z.number(),
  problemCount: z.number(),
});
export const trackListSchema = z.object({ items: z.array(trackSchema) });

export const adminProblemSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  track: z.string(),
  difficulty: z.enum(DIFFICULTIES),
  status: z.enum(['draft', 'published', 'retired']),
  reviewStatus: z.enum(['needs_review', 'approved']),
  version: z.number(),
  validation: z
    .object({
      ok: z.boolean(),
      errors: z.array(z.string()),
      warnings: z.array(z.string()),
      checkedAt: z.string().optional(),
    })
    .nullable(),
  updatedAt: z.string(),
});
export type AdminProblem = z.infer<typeof adminProblemSchema>;

export const languageSchema = z.enum(LANGUAGES);
