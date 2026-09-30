import {
  CONCEPT_TAGS,
  DIFFICULTIES,
  FORMATS,
  LANGUAGES,
  PROBLEM_MODES,
  TRACK_SLUGS,
} from '@forge/shared';
import { z } from 'zod';

export const COMPARATORS = ['exact', 'unordered', 'float', 'rows', 'rows-unordered'] as const;
export type Comparator = (typeof COMPARATORS)[number];

/** problem.yaml (spec section 5). */
export const manifestSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'id must be kebab-case'),
    title: z.string().min(3).max(100),
    track: z.enum(TRACK_SLUGS),
    format: z.enum(FORMATS),
    difficulty: z.enum(DIFFICULTIES),
    tags: z.array(z.enum(CONCEPT_TAGS)).min(1),
    languages: z.array(z.enum(LANGUAGES)).min(1),
    mode: z.enum(PROBLEM_MODES),
    limits: z.object({
      timeMs: z.number().int().min(100).max(20_000),
      memoryMb: z.number().int().min(32).max(2048),
      outputKb: z.number().int().min(1).max(1024),
    }),
    authors: z.array(z.string()).min(1),
    version: z.number().int().min(1),
    /** Human review gate (CLAUDE.md): only `approved` packages can be published in production. */
    review: z.enum(['needs-review', 'approved']).default('needs-review'),
    /** Function to call per language (write-code / fix-code). Not used by sql or flag. */
    entry: z.record(z.string(), z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/)).optional(),
    comparator: z.enum(COMPARATORS).default('exact'),
    /** Minutes allowed in verified mode (spec 7.1 default 45). */
    verifiedMinutes: z.number().int().min(5).max(180).default(45),
  })
  .superRefine((m, ctx) => {
    const needsEntry = m.format === 'write-code' || m.format === 'fix-code';
    for (const lang of m.languages) {
      if (needsEntry && lang !== 'sql' && !m.entry?.[lang]) {
        ctx.addIssue({
          code: 'custom',
          path: ['entry', lang],
          message: `entry.${lang} is required`,
        });
      }
    }
    if (m.format === 'flag' && m.languages.join() !== 'python') {
      ctx.addIssue({
        code: 'custom',
        path: ['languages'],
        message: 'flag problems list [python] (the language of the reference solver)',
      });
    }
  });
export type Manifest = z.infer<typeof manifestSchema>;

/** Values available to statement/starter placeholders, plus anything the tests need. */
export interface Instance {
  /** Rendered into {{placeholders}} in statement.md, starter/ and reference/ files. */
  params: Record<string, string | number>;
  /** Free-form data used by tests.ts and followups.ts. Never sent to the client. */
  data?: unknown;
  /** Flag format: downloadable files (name → contents). */
  files?: Record<string, string>;
}

export interface TestCase {
  id: string;
  /** Short category shown to the user when a hidden test fails, e.g. "empty input". */
  category: string;
  args?: unknown[];
  setupSql?: string;
  expected: unknown;
}

export interface TestSuite {
  visible: TestCase[];
  hidden: TestCase[];
}

export interface Rng {
  /** Float in [0, 1). */
  next(): number;
  int(min: number, max: number): number;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
  sample<T>(items: readonly T[], n: number): T[];
  bool(p?: number): boolean;
  /** Random identifier-ish word from a built-in list, e.g. for variable or product names. */
  word(kind: 'product' | 'person' | 'city' | 'noun'): string;
  hex(bytes: number): string;
}

export interface GenContext {
  rng: Rng;
  seed: number;
  /** Flag format only: this user's flag, to embed in generated files. */
  flag?: string;
}

export type Generator = (ctx: GenContext) => Instance;
/** `rng` is seeded from the instance seed (independently of the generator's stream). */
export type TestsBuilder = (instance: Instance, ctx: { rng: Rng; seed: number }) => TestSuite;

export interface FollowUpQuestion {
  id: string;
  kind: 'predict' | 'edge-case' | 'change' | 'explain';
  prompt: string;
  /** Multiple choice options; omitted for free-text predict answers. */
  options?: string[];
  /**
   * How the server finds the right answer. `static` answers are fixed; `run` answers come from
   * running the user's own code on `args` (predict) or checking it passes `args` (edge-case).
   */
  answer:
    | { type: 'static'; value: string }
    | { type: 'run'; args: unknown[]; mode: 'value' | 'passes'; expected?: unknown };
}

export type FollowUpsBuilder = (
  instance: Instance,
  userCode: string,
  language: string,
) => FollowUpQuestion[];

export interface PackageModule {
  generate: Generator;
  tests?: TestsBuilder;
  followups?: FollowUpsBuilder;
}
