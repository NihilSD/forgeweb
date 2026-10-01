/**
 * Spec L8 acceptance: scoring with synthetic event logs (honest solve, pasted solve, tab-away
 * solve), plus the "never on a single signal" property of spec 7.
 */
import type { AttemptEvent } from '@forge/shared';
import { describe, expect, it } from 'vitest';
import { INTEGRITY } from './integrity.config.js';
import { computeIntegrity, type IntegrityInput } from './integrity-score.js';

const STARTER = 'def match_orders(amounts, target):\n    pass\n';
const SOLUTION = [
  'def match_orders(amounts, target):',
  '    seen = {}',
  '    for j, amount in enumerate(amounts):',
  '        need = target - amount',
  '        if need in seen:',
  '            return [seen[need], j]',
  '        seen[amount] = j',
  '    return []',
  '',
].join('\n');
const MIN = 60_000;

/** Types `SOLUTION` over the starter body a few characters at a time, from `t0` to `t1`. */
function typing(t0: number, t1: number): AttemptEvent[] {
  const events: AttemptEvent[] = [];
  const header = 'def match_orders(amounts, target):\n';
  // Delete the "    pass" body first.
  events.push({ type: 'edit', t: t0, changes: [{ offset: header.length, length: 9, text: '' }] });
  const body = SOLUTION.slice(header.length);
  const chunks = body.match(/[\s\S]{1,4}/g)!;
  chunks.forEach((chunk, i) => {
    events.push({
      type: 'edit',
      t: Math.round(t0 + ((i + 1) / chunks.length) * (t1 - t0)),
      changes: [{ offset: header.length + i * 4, length: 0, text: chunk }],
    });
  });
  return events;
}

function input(over: Partial<IntegrityInput> = {}): IntegrityInput {
  return {
    starter: STARTER,
    finalCode: SOLUTION,
    events: typing(30_000, 11 * MIN),
    server: [
      { type: 'run', t: 9 * MIN, passed: false },
      { type: 'run', t: 11.5 * MIN, passed: true },
      { type: 'submit', t: 12 * MIN, passed: true },
    ],
    followUps: [{ correct: true }, { correct: true }, { correct: true }],
    solveMs: 12 * MIN,
    typicalSolveMs: 14 * MIN,
    budgetMs: 30 * MIN,
    account: { ageDays: 90, emailVerified: true, priorVerified: 0 },
    ...over,
  };
}

const pasted = (): AttemptEvent[] => [
  { type: 'paste', t: 2 * MIN, length: SOLUTION.length, internal: false, hash: 'a'.repeat(64) },
  {
    type: 'edit',
    t: 2 * MIN,
    changes: [{ offset: 0, length: STARTER.length, text: SOLUTION }],
  },
];

describe('integrity score', () => {
  it('verifies an honest solve', () => {
    const r = computeIntegrity(input());
    expect(r.status).toBe('verified');
    expect(r.score).toBeGreaterThanOrEqual(90);
    expect(r.signals.find((s) => s.id === 'replay')?.effect).toBe(0);
  });

  it('still verifies an honest solve with one wrong follow-up', () => {
    const r = computeIntegrity(
      input({ followUps: [{ correct: true }, { correct: false }, { correct: true }] }),
    );
    expect(r.status).toBe('verified');
  });

  it('does not verify a solve pasted from outside the editor', () => {
    const r = computeIntegrity(
      input({
        events: pasted(),
        server: [{ type: 'submit', t: 3 * MIN, passed: true }],
        solveMs: 3 * MIN,
      }),
    );
    expect(r.status).not.toBe('verified');
    expect(r.signals.find((s) => s.id === 'paste')!.effect).toBeLessThanOrEqual(
      -INTEGRITY.paste.maxPenalty + 1,
    );
  });

  it('sends a pasted solve with wrong follow-ups to human review', () => {
    const r = computeIntegrity(
      input({
        events: pasted(),
        server: [{ type: 'submit', t: 3 * MIN, passed: true }],
        solveMs: 3 * MIN,
        followUps: [{ correct: false }, { correct: false }, { correct: false }],
      }),
    );
    expect(r.status).toBe('review');
  });

  it('does not verify a solve after a long time away from the workspace', () => {
    const events: AttemptEvent[] = [
      { type: 'blur', t: 1 * MIN },
      { type: 'visibility', t: 1 * MIN + 100, state: 'hidden' },
      { type: 'visibility', t: 10 * MIN, state: 'visible' },
      { type: 'focus', t: 10 * MIN + 50 },
      ...typing(10.5 * MIN, 12 * MIN),
    ];
    const r = computeIntegrity(input({ events, solveMs: 13 * MIN }));
    expect(r.status).toBe('unverified');
    expect(r.signals.find((s) => s.id === 'focus')!.value).toBeGreaterThan(8 * MIN);
  });

  it('ignores short focus losses and pastes from inside the editor', () => {
    const events = [
      ...typing(30_000, 11 * MIN),
      { type: 'blur', t: 4 * MIN } as const,
      { type: 'focus', t: 4 * MIN + 40_000 } as const,
      {
        type: 'paste',
        t: 5 * MIN,
        length: 120,
        internal: true,
        hash: 'b'.repeat(64),
      } as const,
    ];
    const r = computeIntegrity(input({ events }));
    expect(r.signals.find((s) => s.id === 'focus')!.effect).toBe(0);
    expect(r.signals.find((s) => s.id === 'paste')!.effect).toBe(0);
    expect(r.status).toBe('verified');
  });

  it('treats code that the recorded edits cannot explain like an outside paste', () => {
    // No edit events at all, yet a full solution was submitted (recorder suppressed).
    const r = computeIntegrity(input({ events: [] }));
    expect(r.signals.find((s) => s.id === 'replay')!.effect).toBeLessThan(0);
    expect(r.status).not.toBe('verified');
  });

  it('counts a large insertion without a paste event as an outside paste', () => {
    const events: AttemptEvent[] = [
      { type: 'edit', t: MIN, changes: [{ offset: 0, length: STARTER.length, text: SOLUTION }] },
    ];
    const r = computeIntegrity(input({ events }));
    expect(r.signals.find((s) => s.id === 'paste')!.effect).toBeLessThan(0);
  });

  it('penalises solves far faster than verified solvers', () => {
    const fast = computeIntegrity(input({ solveMs: MIN, typicalSolveMs: 20 * MIN }));
    const normal = computeIntegrity(input());
    expect(fast.signals.find((s) => s.id === 'speed')!.effect).toBeLessThan(0);
    expect(normal.signals.find((s) => s.id === 'speed')!.effect).toBe(0);
  });

  it('makes all-wrong follow-ups the strongest single negative signal', () => {
    const r = computeIntegrity(
      input({ followUps: [{ correct: false }, { correct: false }, { correct: false }] }),
    );
    const effects = r.signals.map((s) => s.effect);
    expect(Math.min(...effects)).toBe(r.signals.find((s) => s.id === 'followups')!.effect);
    expect(r.status).toBe('review');
  });

  it('never sends an attempt to review on any single non-follow-up signal', () => {
    // Each negative signal alone, everything else honest.
    const cases: Partial<IntegrityInput>[] = [
      { events: pasted(), solveMs: 3 * MIN },
      { events: [] },
      {
        events: [{ type: 'blur', t: MIN }, ...typing(29 * MIN, 29.5 * MIN)],
        solveMs: 30 * MIN,
      },
      { solveMs: 30_000, typicalSolveMs: 20 * MIN },
    ];
    for (const c of cases) expect(computeIntegrity(input(c)).status).not.toBe('review');
  });

  it('keeps the score within 0..100 and reports every signal', () => {
    const r = computeIntegrity(
      input({
        events: pasted(),
        followUps: [{ correct: false }],
        solveMs: 1000,
        account: { ageDays: 0, emailVerified: false, priorVerified: 0 },
      }),
    );
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.signals.map((s) => s.id).sort()).toEqual(
      ['editing', 'focus', 'followups', 'fullscreen', 'paste', 'replay', 'speed', 'trust'].sort(),
    );
  });

  it('matches the reference outcomes documented in docs/decisions/integrity-score.md', () => {
    const wrong = [{ correct: false }, { correct: false }, { correct: false }];
    const paste = {
      events: pasted(),
      server: [{ type: 'submit' as const, t: 3 * MIN, passed: true }],
      solveMs: 3 * MIN,
    };
    const away: AttemptEvent[] = [
      { type: 'blur', t: 1 * MIN },
      { type: 'focus', t: 10 * MIN },
      ...typing(10.5 * MIN, 12 * MIN),
    ];
    expect(computeIntegrity(input()).score).toBe(99);
    expect(
      computeIntegrity(
        input({ followUps: [{ correct: true }, { correct: false }, { correct: true }] }),
      ).score,
    ).toBe(76);
    expect(computeIntegrity(input(paste)).score).toBe(42);
    expect(computeIntegrity(input({ ...paste, followUps: wrong })).score).toBe(0);
    expect(computeIntegrity(input({ events: away, solveMs: 13 * MIN })).score).toBe(69);
    expect(computeIntegrity(input({ followUps: wrong })).score).toBe(29);
  });
});
