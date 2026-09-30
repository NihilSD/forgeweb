import { z } from 'zod';
import { LANGUAGES } from '../constants.js';
import { VERDICTS } from '../verdicts.js';

/** 64 KB is plenty for any solution and keeps job payloads small. */
export const MAX_CODE_BYTES = 64 * 1024;

export const codeSchema = z
  .string()
  .max(MAX_CODE_BYTES, 'Code is limited to 64 KB.')
  .refine((c) => c.trim().length > 0, 'Write some code first.');

export const submitSchema = z.object({
  language: z.enum(LANGUAGES),
  code: codeSchema,
});
export type SubmitInput = z.infer<typeof submitSchema>;

export const runSchema = submitSchema.extend({
  /** Custom input: function arguments as a JSON array (not for SQL). */
  customArgs: z.array(z.unknown()).max(20).optional(),
});
export type RunInput = z.infer<typeof runSchema>;

export const gradedTestSchema = z.object({
  id: z.string(),
  category: z.string(),
  visible: z.boolean(),
  passed: z.boolean(),
  verdict: z.enum(VERDICTS),
  timeMs: z.number(),
  args: z.array(z.unknown()).optional(),
  expected: z.unknown().optional(),
  actual: z.unknown().optional(),
  stdout: z.string().optional(),
  error: z.string().optional(),
});

export const submissionSchema = z.object({
  id: z.string(),
  problemSlug: z.string(),
  language: z.string(),
  kind: z.enum(['run', 'submit']),
  status: z.enum(['queued', 'running', 'done']),
  verdict: z.enum(VERDICTS).nullable(),
  runtimeMs: z.number().nullable(),
  memoryKb: z.number().nullable(),
  testsPassed: z.number().nullable(),
  testsTotal: z.number().nullable(),
  message: z.string().nullable(),
  tests: z.array(gradedTestSchema),
  /** Custom-input runs: what the function returned (no expected value exists). */
  customOutput: z
    .object({
      value: z.unknown().optional(),
      stdout: z.string().optional(),
      error: z.string().optional(),
    })
    .nullable(),
  createdAt: z.string(),
});
export type Submission = z.infer<typeof submissionSchema>;

export const submissionListSchema = z.object({
  items: z.array(
    submissionSchema.omit({ tests: true, customOutput: true }).extend({ code: z.string() }),
  ),
});
