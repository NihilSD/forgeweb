import type { Difficulty } from '@forge/shared';

/** Spec 8 XP rules. Every number here is documented in docs/decisions/0009-engagement.md. */
export const XP_RULES = {
  solve: { easy: 10, medium: 20, hard: 40, expert: 80 } satisfies Record<Difficulty, number>,
  /** Each hint level used before the first solve takes 25% off its XP. */
  hintPenalty: 0.25,
  lesson: 5,
  daily: 10,
} as const;

export function solveXp(difficulty: Difficulty, hintsUsed: number): number {
  const base = XP_RULES.solve[difficulty];
  return Math.max(0, Math.round(base * (1 - XP_RULES.hintPenalty * hintsUsed)));
}

/** XP needed to reach `level`: 0, 100, 300, 600, 1000, … (50 · L · (L − 1)). */
export function levelThreshold(level: number): number {
  return 50 * level * (level - 1);
}

export function levelFor(xp: number): { level: number; levelXp: number; nextLevelXp: number } {
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + (8 * Math.max(0, xp)) / 100)) / 2));
  // Guard against floating point at exact thresholds.
  while (levelThreshold(level + 1) <= xp) level++;
  while (level > 1 && levelThreshold(level) > xp) level--;
  return { level, levelXp: levelThreshold(level), nextLevelXp: levelThreshold(level + 1) };
}

/** Whole calendar days from `a` to `b` (YYYY-MM-DD). */
export function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export interface StreakState {
  current: number;
  longest: number;
  /** Last local day (YYYY-MM-DD) with activity. */
  lastDay: string | null;
  /** Local month (YYYY-MM) the used freezes belong to. */
  freezeMonth: string | null;
  freezesUsed: number;
  /** Days covered by freezes (for display). */
  frozenDays: string[];
}

export const EMPTY_STREAK: StreakState = {
  current: 0,
  longest: 0,
  lastDay: null,
  freezeMonth: null,
  freezesUsed: 0,
  frozenDays: [],
};

function freezesLeft(s: StreakState, day: string, perMonth: number): number {
  const used = s.freezeMonth === day.slice(0, 7) ? s.freezesUsed : 0;
  return Math.max(0, perMonth - used);
}

/**
 * Spec 8: a day counts with one solved problem or lesson, in the user's time zone. Missed days are
 * covered automatically by this month's freezes when enough are left; otherwise the streak restarts.
 */
export function advanceStreak(s: StreakState, day: string, freezesPerMonth: number): StreakState {
  if (!s.lastDay) return { ...s, current: 1, longest: Math.max(1, s.longest), lastDay: day };
  const gap = dayDiff(s.lastDay, day);
  if (gap <= 0) return s;
  let next: StreakState;
  if (gap === 1) {
    next = { ...s, current: s.current + 1, lastDay: day };
  } else {
    const missed = gap - 1;
    const month = day.slice(0, 7);
    if (missed <= freezesLeft(s, day, freezesPerMonth)) {
      const used = s.freezeMonth === month ? s.freezesUsed : 0;
      next = {
        ...s,
        current: s.current + 1,
        lastDay: day,
        freezeMonth: month,
        freezesUsed: used + missed,
        frozenDays: [
          ...s.frozenDays,
          ...Array.from({ length: missed }, (_, i) => addDays(s.lastDay!, i + 1)),
        ].slice(-60),
      };
    } else {
      next = { ...s, current: 1, lastDay: day };
    }
  }
  return { ...next, longest: Math.max(next.longest, next.current) };
}

/** The streak as shown today: still standing if the missed days can be covered by freezes. */
export function streakNow(
  s: StreakState,
  today: string,
  freezesPerMonth: number,
): { current: number; longest: number; activeToday: boolean; freezesLeft: number } {
  const left = freezesLeft(s, today, freezesPerMonth);
  const base = { longest: s.longest, freezesLeft: left };
  if (!s.lastDay) return { ...base, current: 0, activeToday: false };
  const gap = dayDiff(s.lastDay, today);
  if (gap <= 0) return { ...base, current: s.current, activeToday: true };
  // Days strictly between the last active day and today are missed; today isn't over yet.
  const missed = gap - 1;
  return { ...base, current: missed <= left ? s.current : 0, activeToday: false };
}
