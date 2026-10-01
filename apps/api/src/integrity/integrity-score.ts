import {
  type AttemptEvent,
  type IntegritySignal,
  normalizeEol,
  replayDocument,
} from '@forge/shared';
import { INTEGRITY, type IntegrityConfig } from './integrity.config.js';

export interface IntegrityInput {
  /** Starter code the editor opened with. */
  starter: string;
  /** Code of the accepted submission. */
  finalCode: string;
  /** Client-recorded events, in order. */
  events: AttemptEvent[];
  /** Server-recorded runs and submits (ms since the attempt started). */
  server: { type: 'run' | 'submit'; t: number; passed: boolean }[];
  followUps: { correct: boolean }[];
  /** Time from the start of the attempt to the accepted submission. */
  solveMs: number;
  /** Median solve time of verified solvers, or null when there are too few. */
  typicalSolveMs: number | null;
  /** The problem's verified time budget. */
  budgetMs: number;
  account: { ageDays: number; emailVerified: boolean; priorVerified: number };
}

export type IntegrityStatus = 'verified' | 'unverified' | 'review';

export interface IntegrityResult {
  score: number;
  status: IntegrityStatus;
  signals: IntegritySignal[];
}

/**
 * Spec 7.4: a 0–100 score from weighted signals. Pure function of the attempt's logs, so it can
 * be unit-tested with synthetic logs and re-run by a moderator.
 */
export function computeIntegrity(
  input: IntegrityInput,
  w: IntegrityConfig = INTEGRITY,
): IntegrityResult {
  const signals = [
    followUpSignal(input, w),
    pasteSignal(input, w),
    replaySignal(input, w),
    focusSignal(input, w),
    fullscreenSignal(input, w),
    speedSignal(input, w),
    editingSignal(input, w),
    trustSignal(input, w),
  ];
  const raw = w.base + signals.reduce((sum, s) => sum + s.effect, 0);
  const score = Math.max(0, Math.min(100, Math.round(raw)));
  const status: IntegrityStatus =
    score >= w.thresholds.verified
      ? 'verified'
      : score >= w.thresholds.review
        ? 'unverified'
        : 'review';
  return { score, status, signals };
}

const round = (n: number) => Math.round(n * 10) / 10;

function followUpSignal(i: IntegrityInput, w: IntegrityConfig): IntegritySignal {
  const total = i.followUps.length;
  const accuracy = total ? i.followUps.filter((f) => f.correct).length / total : null;
  const { allCorrect, allWrong } = w.followUps;
  return {
    id: 'followups',
    label: 'Follow-up answers correct (share)',
    value: accuracy ?? -1,
    effect: accuracy === null ? 0 : round(allWrong + (allCorrect - allWrong) * accuracy),
  };
}

function pasteSignal(i: IntegrityInput, w: IntegrityConfig): IntegritySignal {
  const pastes = i.events.filter((e) => e.type === 'paste');
  let outside = pastes
    .filter((p) => !p.internal && p.length >= w.paste.minChars)
    .reduce((sum, p) => sum + p.length, 0);
  // Large insertions with no paste event nearby (drag and drop, scripts, suppressed events).
  for (const e of i.events) {
    if (e.type !== 'edit') continue;
    for (const c of e.changes) {
      if (c.text.length < w.paste.unannouncedInsertChars) continue;
      const announced = pastes.some(
        (p) => Math.abs(p.t - e.t) <= 1000 && p.length >= c.text.length * 0.8,
      );
      if (!announced) outside += c.text.length;
    }
  }
  const ratio = Math.min(1, outside / Math.max(1, normalizeEol(i.finalCode).length));
  return {
    id: 'paste',
    label: 'Text pasted from outside the editor (share of final code)',
    value: round(ratio),
    effect: ratio === 0 ? 0 : round(-w.paste.maxPenalty * ratio),
  };
}

function replaySignal(i: IntegrityInput, w: IntegrityConfig): IntegritySignal {
  const rebuilt = replayDocument(i.starter, i.events);
  const matches = rebuilt !== null && rebuilt.trimEnd() === normalizeEol(i.finalCode).trimEnd();
  return {
    id: 'replay',
    label: 'Recorded edits reproduce the submitted code',
    value: matches ? 1 : 0,
    effect: matches ? 0 : -w.replayMismatch.penalty,
  };
}

/** Total time the workspace was blurred or hidden (overlapping periods counted once). */
export function outOfFocusMs(events: AttemptEvent[], endMs: number): number {
  let blurred = false;
  let hidden = false;
  let since: number | null = null;
  let total = 0;
  for (const e of [...events].sort((a, b) => a.t - b.t)) {
    const wasOut = blurred || hidden;
    if (e.type === 'blur') blurred = true;
    else if (e.type === 'focus') blurred = false;
    else if (e.type === 'visibility') hidden = e.state === 'hidden';
    else continue;
    const isOut = blurred || hidden;
    if (!wasOut && isOut) since = e.t;
    if (wasOut && !isOut && since !== null) {
      total += Math.max(0, e.t - since);
      since = null;
    }
  }
  if (since !== null) total += Math.max(0, endMs - since);
  return total;
}

function focusSignal(i: IntegrityInput, w: IntegrityConfig): IntegritySignal {
  const ms = outOfFocusMs(i.events, i.solveMs);
  const beyondMin = Math.max(0, ms - w.focus.graceMs) / 60_000;
  return {
    id: 'focus',
    label: 'Time out of focus (ms)',
    value: ms,
    effect:
      beyondMin === 0 ? 0 : round(-Math.min(w.focus.maxPenalty, beyondMin * w.focus.perMinute)),
  };
}

function fullscreenSignal(i: IntegrityInput, w: IntegrityConfig): IntegritySignal {
  const exits = i.events.filter((e) => e.type === 'fullscreen_exit').length;
  return {
    id: 'fullscreen',
    label: 'Full-screen exits',
    value: exits,
    effect: exits === 0 ? 0 : -Math.min(w.fullscreen.maxPenalty, exits * w.fullscreen.perExit),
  };
}

function speedSignal(i: IntegrityInput, w: IntegrityConfig): IntegritySignal {
  const typical = i.typicalSolveMs ?? i.budgetMs * w.speed.fallbackTypicalFraction;
  const ratio = typical > 0 ? i.solveMs / typical : 1;
  const tier = w.speed.tiers.find((t) => ratio < t.below);
  return {
    id: 'speed',
    label: 'Solve time relative to typical',
    value: round(ratio),
    effect: tier ? -tier.penalty : 0,
  };
}

function editingSignal(i: IntegrityInput, w: IntegrityConfig): IntegritySignal {
  const edits = i.events.filter((e) => e.type === 'edit').length;
  const lastSubmit = Math.max(...i.server.filter((s) => s.type === 'submit').map((s) => s.t), 0);
  const ran = i.server.some((s) => s.type === 'run' && s.t <= lastSubmit);
  const ordered = [...i.server].sort((a, b) => a.t - b.t);
  const firstFail = ordered.findIndex((s) => !s.passed);
  const fixed = firstFail >= 0 && ordered.slice(firstFail + 1).some((s) => s.passed);
  const effect =
    (edits >= w.editing.minEdits ? w.editing.editsBonus : 0) +
    (ran ? w.editing.runBonus : 0) +
    (fixed ? w.editing.fixBonus : 0);
  return { id: 'editing', label: 'Edit events', value: edits, effect };
}

function trustSignal(i: IntegrityInput, w: IntegrityConfig): IntegritySignal {
  const a = i.account;
  const effect =
    (a.emailVerified ? w.trust.emailVerified : 0) +
    (a.ageDays >= w.trust.minAgeDays ? w.trust.ageBonus : 0) +
    (a.priorVerified > 0 ? w.trust.priorVerifiedBonus : 0);
  return { id: 'trust', label: 'Account age in days', value: Math.floor(a.ageDays), effect };
}
