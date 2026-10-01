import { readFile } from 'node:fs/promises';
import { CONCEPT_TAGS } from '@forge/shared';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

export const PLACEMENT_QUESTIONS = 10;

const questionSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    tag: z.enum(CONCEPT_TAGS),
    prompt: z.string().min(10),
    options: z.array(z.string().min(1)).min(2).max(6),
    answer: z.number().int().min(0),
  })
  .refine((q) => q.answer < q.options.length, { message: 'answer must index an option' })
  .refine((q) => new Set(q.options).size === q.options.length, {
    message: 'options must be unique',
  });

export const placementSchema = z
  .object({
    status: z.enum(['needs-review', 'approved']),
    questions: z.array(questionSchema).length(PLACEMENT_QUESTIONS),
  })
  .refine((q) => new Set(q.questions.map((x) => x.id)).size === q.questions.length, {
    message: 'question ids must be unique',
  });
export type PlacementFile = z.infer<typeof placementSchema>;

export async function loadPlacement(file: string): Promise<PlacementFile> {
  return placementSchema.parse(parseYaml(await readFile(file, 'utf8')));
}

/** Validation errors for the placement quiz file (empty = valid). */
export async function validatePlacement(file: string): Promise<string[]> {
  try {
    await loadPlacement(file);
    return [];
  } catch (err) {
    if (err instanceof z.ZodError)
      return err.issues.map((i) => `${i.path.join('.') || 'quiz'}: ${i.message}`);
    return [(err as Error).message];
  }
}
