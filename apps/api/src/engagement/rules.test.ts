/**
 * Spec 8 rules: XP, levels and streaks. Streak tests cover time zones and midnight boundaries
 * (L9 acceptance criterion).
 */
import { describe, expect, it } from 'vitest';
import { localDay } from '../common/time.js';
import {
  advanceStreak,
  dayDiff,
  EMPTY_STREAK,
  levelFor,
  solveXp,
  type StreakState,
  streakNow,
} from './rules.js';

/** Applies activity at each instant, in the user's time zone. */
function run(instants: string[], timeZone: string, freezes = 2): StreakState {
  return instants.reduce(
    (s, iso) => advanceStreak(s, localDay(new Date(iso), timeZone), freezes),
    EMPTY_STREAK,
  );
}

describe('XP', () => {
  it('awards 10/20/40/80 by difficulty, minus 25% per hint level', () => {
    expect(solveXp('easy', 0)).toBe(10);
    expect(solveXp('medium', 0)).toBe(20);
    expect(solveXp('hard', 0)).toBe(40);
    expect(solveXp('expert', 0)).toBe(80);
    expect(solveXp('hard', 1)).toBe(30);
    expect(solveXp('hard', 2)).toBe(20);
    expect(solveXp('expert', 3)).toBe(20);
    expect(solveXp('easy', 4)).toBe(0);
  });

  it('maps total XP to levels with growing gaps', () => {
    expect(levelFor(0)).toEqual({ level: 1, levelXp: 0, nextLevelXp: 100 });
    expect(levelFor(99).level).toBe(1);
    expect(levelFor(100)).toEqual({ level: 2, levelXp: 100, nextLevelXp: 300 });
    expect(levelFor(299).level).toBe(2);
    expect(levelFor(300).level).toBe(3);
    expect(levelFor(1000).level).toBe(5);
    expect(levelFor(1_000_000).level).toBeGreaterThan(100);
  });
});

describe('streaks', () => {
  it('counts calendar days in the user time zone', () => {
    expect(dayDiff('2026-02-28', '2026-03-01')).toBe(1);
    expect(dayDiff('2028-02-28', '2028-03-01')).toBe(2);
    expect(dayDiff('2026-12-31', '2027-01-01')).toBe(1);
  });

  it('continues across local midnight even when UTC has not changed day', () => {
    // Auckland is UTC+13 in January: 23:30 and 00:30 local are on the same UTC day.
    const s = run(['2026-01-10T10:30:00Z', '2026-01-10T11:30:00Z'], 'Pacific/Auckland');
    expect(s.current).toBe(2);
  });

  it('does not double count two sessions on the same local day across UTC midnight', () => {
    // Los Angeles is UTC-8 in January: 16:30 and 17:30 local fall on different UTC days.
    const s = run(['2026-01-10T23:30:00Z', '2026-01-11T01:30:00Z'], 'America/Los_Angeles');
    expect(s.current).toBe(1);
  });

  it('gives the same instants different results in different time zones', () => {
    const instants = ['2026-01-10T20:00:00Z', '2026-01-11T09:00:00Z'];
    expect(run(instants, 'UTC').current).toBe(2);
    // Kiritimati (UTC+14): 10:00 and 23:00 on 11 January, the same day.
    expect(run(instants, 'Pacific/Kiritimati').current).toBe(1);
  });

  it('handles daylight saving changes (23 and 25 hour days)', () => {
    // Europe/Bucharest springs forward on 29 March 2026 (UTC+2 → +3) and falls back on 25 October.
    // 20:00Z is 22:00, then 23:00, 23:00 local: three consecutive days, no freezes involved.
    expect(
      run(
        ['2026-03-28T20:00:00Z', '2026-03-29T20:00:00Z', '2026-03-30T20:00:00Z'],
        'Europe/Bucharest',
        0,
      ).current,
    ).toBe(3);
    // 21:30Z is 00:30 local on 30 March after the change: 28 → 30 skips a day.
    expect(
      run(['2026-03-28T21:30:00Z', '2026-03-29T21:30:00Z'], 'Europe/Bucharest', 0).current,
    ).toBe(1);
    // 23:30 local on 24 October (UTC+3) and 23:30 local on 25 October (UTC+2).
    expect(
      run(['2026-10-24T20:30:00Z', '2026-10-25T21:30:00Z'], 'Europe/Bucharest', 0).current,
    ).toBe(2);
  });

  it('resets after a missed day without freezes, and keeps the longest streak', () => {
    const s = run(
      [
        '2026-05-01T12:00:00Z',
        '2026-05-02T12:00:00Z',
        '2026-05-03T12:00:00Z',
        '2026-05-06T12:00:00Z',
      ],
      'UTC',
      0,
    );
    expect(s.current).toBe(1);
    expect(s.longest).toBe(3);
  });

  it('uses monthly freezes for missed days automatically', () => {
    const s = run(
      ['2026-05-01T12:00:00Z', '2026-05-02T12:00:00Z', '2026-05-05T12:00:00Z'],
      'UTC',
      2,
    );
    expect(s.current).toBe(3);
    expect(s.freezesUsed).toBe(2);
    expect(s.frozenDays).toEqual(['2026-05-03', '2026-05-04']);
    // No freezes left this month: the next gap breaks the streak.
    const after = advanceStreak(s, '2026-05-07', 2);
    expect(after.current).toBe(1);
    // A new month refills them.
    const june = run(['2026-05-30T12:00:00Z', '2026-06-01T12:00:00Z'], 'UTC', 2);
    expect(june.current).toBe(2);
  });

  it('ignores activity that is not after the last active day', () => {
    const s = run(['2026-05-02T12:00:00Z', '2026-05-02T13:00:00Z'], 'UTC');
    expect(advanceStreak(s, '2026-05-01', 2)).toEqual(s);
  });

  it('reports the streak as it stands now, without guilt-tripping', () => {
    const s = run(['2026-05-01T12:00:00Z', '2026-05-02T12:00:00Z'], 'UTC');
    expect(streakNow(s, '2026-05-02', 2)).toMatchObject({ current: 2, activeToday: true });
    expect(streakNow(s, '2026-05-03', 2)).toMatchObject({ current: 2, activeToday: false });
    // One missed day is covered by a freeze, so the streak still stands.
    expect(streakNow(s, '2026-05-04', 2)).toMatchObject({ current: 2, freezesLeft: 2 });
    expect(streakNow(s, '2026-05-06', 2).current).toBe(0);
    expect(streakNow(EMPTY_STREAK, '2026-05-06', 2).current).toBe(0);
  });
});
