import { z } from 'zod';
import { LANGUAGES } from '../constants.js';
import { visibleTestSchema } from './problems.js';
import { codeSchema } from './submissions.js';

/** Milliseconds since the attempt started (client clock). */
const t = z
  .number()
  .int()
  .min(0)
  .max(6 * 60 * 60 * 1000);

/** One editor content change: replace `length` characters at `offset` with `text`. */
export const editChangeSchema = z.object({
  offset: z.number().int().min(0).max(1_000_000),
  length: z.number().int().min(0).max(1_000_000),
  text: z.string().max(65_536),
});
export type EditChange = z.infer<typeof editChangeSchema>;

/** Spec 7.2: what the client records during a verified attempt. */
export const attemptEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('edit'), t, changes: z.array(editChangeSchema).min(1).max(100) }),
  z.object({
    type: z.literal('paste'),
    t,
    length: z.number().int().min(0).max(1_000_000),
    /** True when the text was copied from inside the editor during this attempt. */
    internal: z.boolean(),
    /** SHA-256 (hex) of the first 200 pasted characters. */
    hash: z.string().regex(/^[0-9a-f]{64}$/),
  }),
  z.object({ type: z.literal('blur'), t }),
  z.object({ type: z.literal('focus'), t }),
  z.object({ type: z.literal('visibility'), t, state: z.enum(['hidden', 'visible']) }),
  z.object({ type: z.literal('fullscreen_exit'), t }),
  z.object({ type: z.literal('fullscreen_enter'), t }),
]);
export type AttemptEvent = z.infer<typeof attemptEventSchema>;

export const MAX_EVENTS_PER_BATCH = 1000;

/** Sent every 5 seconds (EVENT_BATCH_MS). `seq` makes retries idempotent. */
export const eventBatchSchema = z.object({
  seq: z.number().int().min(0).max(100_000),
  events: z.array(attemptEventSchema).max(MAX_EVENTS_PER_BATCH),
});
export type EventBatch = z.infer<typeof eventBatchSchema>;

/** Events the server records itself (never trusted from the client). */
export type ServerAttemptEvent =
  | {
      type: 'run' | 'submit';
      t: number;
      codeHash: string;
      verdict: string | null;
      passed: number | null;
      total: number | null;
    }
  | { type: 'followup'; t: number; questionId: string; correct: boolean; answeredMs: number };

export const ATTEMPT_STATUSES = [
  'in_progress',
  'followups',
  'verified',
  'unverified',
  'review',
  'appealed',
  'expired',
] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

export const startAttemptSchema = z.object({
  /** The consent screen must be accepted every time (spec 3.2). */
  consent: z.literal(true),
  language: z.enum(LANGUAGES),
});

export const attemptCodeSchema = z.object({ code: codeSchema });

export const appealSchema = z.object({ reason: z.string().trim().min(20).max(2000) });

export const followUpAnswerSchema = z.object({
  questionId: z.string().min(1).max(64),
  answer: z.string().trim().min(1).max(500),
});

export const followUpViewSchema = z.object({
  id: z.string(),
  kind: z.enum(['predict', 'edge-case', 'change', 'explain']),
  prompt: z.string(),
  options: z.array(z.string()).nullable(),
  /** Change questions: the user's own submitted code, to pick a line from. */
  code: z.string().nullable(),
  index: z.number(),
  total: z.number(),
  deadline: z.string(),
});
export type FollowUpView = z.infer<typeof followUpViewSchema>;

export const attemptSchema = z.object({
  id: z.string(),
  problemSlug: z.string(),
  problemTitle: z.string(),
  language: z.string(),
  status: z.enum(ATTEMPT_STATUSES),
  startedAt: z.string(),
  endsAt: z.string(),
  submittedAt: z.string().nullable(),
  /** Lets the client correct for clock skew when showing the timer. */
  serverNow: z.string(),
  statement: z.string(),
  starter: z.string(),
  entry: z.string().nullable(),
  visibleTests: z.array(visibleTestSchema),
  /** Percentage of tests passed by the best submission. */
  score: z.number().nullable(),
  integrityScore: z.number().nullable(),
  followUps: z.object({ total: z.number(), answered: z.number(), correct: z.number() }),
  appeal: z
    .object({ status: z.enum(['pending', 'upheld', 'denied']), reason: z.string() })
    .nullable(),
  canAppeal: z.boolean(),
});
export type Attempt = z.infer<typeof attemptSchema>;

export const attemptSummarySchema = z.object({
  id: z.string(),
  problemSlug: z.string(),
  problemTitle: z.string(),
  status: z.enum(ATTEMPT_STATUSES),
  startedAt: z.string(),
  score: z.number().nullable(),
  integrityScore: z.number().nullable(),
});
export const attemptListSchema = z.object({ items: z.array(attemptSummarySchema) });

export const verifiedChallengeSchema = z.object({
  slug: z.string(),
  title: z.string(),
  difficulty: z.string(),
  track: z.string(),
  languages: z.array(z.string()),
  minutes: z.number(),
  /** The user's best status on this challenge, if any. */
  best: z.enum(ATTEMPT_STATUSES).nullable(),
});
export const verifiedListSchema = z.object({
  items: z.array(verifiedChallengeSchema),
  /** Starts left this week; null = unlimited. */
  remainingThisWeek: z.number().nullable(),
  activeAttemptId: z.string().nullable(),
});

export const integritySignalSchema = z.object({
  id: z.string(),
  label: z.string(),
  value: z.number(),
  effect: z.number(),
});
export type IntegritySignal = z.infer<typeof integritySignalSchema>;

/** Owner and moderators only. */
export const replaySchema = z.object({
  attemptId: z.string(),
  problemTitle: z.string(),
  language: z.string(),
  status: z.enum(ATTEMPT_STATUSES),
  startedAt: z.string(),
  durationMs: z.number(),
  starter: z.string(),
  finalCode: z.string().nullable(),
  events: z.array(attemptEventSchema),
  serverEvents: z.array(z.record(z.string(), z.unknown())),
  followUps: z.array(
    z.object({
      id: z.string(),
      kind: z.string(),
      prompt: z.string(),
      answer: z.string().nullable(),
      correct: z.boolean().nullable(),
      answeredMs: z.number().nullable(),
    }),
  ),
  integrityScore: z.number().nullable(),
  /** Moderators only. */
  signals: z.array(integritySignalSchema).nullable(),
});
export type Replay = z.infer<typeof replaySchema>;

export const moderationItemSchema = z.object({
  attemptId: z.string(),
  user: z.string(),
  problemTitle: z.string(),
  status: z.enum(ATTEMPT_STATUSES),
  integrityScore: z.number().nullable(),
  appealReason: z.string().nullable(),
  submittedAt: z.string().nullable(),
});
export const moderationQueueSchema = z.object({ items: z.array(moderationItemSchema) });

export const reviewDecisionSchema = z.object({
  decision: z.enum(['verified', 'unverified']),
  notes: z.string().trim().min(5).max(2000),
});
