/**
 * Spec V1.1: "Glicko-2 matches reference test vectors". The vectors are the worked example in
 * Mark Glickman, "Example of the Glicko-2 system" (glicko.net/glicko/glicko2.pdf), including the
 * intermediate values of every step.
 */
import { describe, expect, it } from 'vitest';
import {
  fromGlicko2Scale,
  GLICKO2_DEFAULTS,
  glicko2Internals,
  idlePeriods,
  rate,
  toGlicko2Scale,
} from './glicko2.js';

const player = { rating: 1500, rd: 200, volatility: 0.06 };
const games = [
  { opponent: { rating: 1400, rd: 30 }, score: 1 },
  { opponent: { rating: 1550, rd: 100 }, score: 0 },
  { opponent: { rating: 1700, rd: 300 }, score: 0 },
];

describe('Glicko-2 (Glickman worked example, tau = 0.5)', () => {
  it('step 2: converts to the Glicko-2 scale', () => {
    const p = toGlicko2Scale(player.rating, player.rd);
    expect(p.mu).toBeCloseTo(0, 4);
    expect(p.phi).toBeCloseTo(1.1513, 4);
    const opp = games.map((g) => toGlicko2Scale(g.opponent.rating, g.opponent.rd));
    expect(opp.map((o) => o.mu)).toEqual([
      expect.closeTo(-0.5756, 4),
      expect.closeTo(0.2878, 4),
      expect.closeTo(1.1513, 4),
    ]);
    expect(opp.map((o) => o.phi)).toEqual([
      expect.closeTo(0.1727, 4),
      expect.closeTo(0.5756, 4),
      expect.closeTo(1.7269, 4),
    ]);
  });

  it('steps 3–4: g, E, v and delta', () => {
    const { g, E, v, delta } = glicko2Internals(player, games);
    expect(g).toEqual([
      expect.closeTo(0.9955, 4),
      expect.closeTo(0.9531, 4),
      expect.closeTo(0.7242, 4),
    ]);
    expect(E).toEqual([
      expect.closeTo(0.639, 3),
      expect.closeTo(0.432, 3),
      expect.closeTo(0.303, 3),
    ]);
    // The paper rounds every intermediate to 4 digits, so its v and delta are about 0.0005 off the
    // exact values: match the paper within that rounding, and pin the exact values too.
    expect(Math.abs(v - 1.7785)).toBeLessThan(0.001);
    expect(Math.abs(delta - -0.4834)).toBeLessThan(0.001);
    expect(v).toBeCloseTo(1.778977, 6);
    expect(delta).toBeCloseTo(-0.483933, 6);
  });

  it('steps 5–8: new volatility, RD and rating', () => {
    const next = rate(player, games, { tau: 0.5 });
    // Published (rounded intermediates): sigma' 0.05999, r' 1464.06, RD' 151.52.
    expect(Math.abs(next.volatility - 0.05999)).toBeLessThan(0.00001);
    expect(Math.abs(next.rating - 1464.06)).toBeLessThan(0.01);
    expect(Math.abs(next.rd - 151.52)).toBeLessThan(0.01);
    // Full precision (the values other complete implementations report).
    expect(next.volatility).toBeCloseTo(0.059996, 6);
    expect(next.rating).toBeCloseTo(1464.0507, 4);
    expect(next.rd).toBeCloseTo(151.5165, 4);
  });

  it('a period without games only widens the RD (step 6)', () => {
    const next = rate(player, [], { tau: 0.5 });
    expect(next.rating).toBe(1500);
    expect(next.volatility).toBe(0.06);
    // phi* = sqrt(phi^2 + sigma^2)
    const phi = 200 / 173.7178;
    expect(next.rd).toBeCloseTo(Math.sqrt(phi ** 2 + 0.06 ** 2) * 173.7178, 6);
  });

  it('round-trips the scale conversion', () => {
    const { mu, phi } = toGlicko2Scale(1723.4, 87.1);
    expect(fromGlicko2Scale(mu, phi)).toEqual({
      rating: expect.closeTo(1723.4, 9),
      rd: expect.closeTo(87.1, 9),
    });
  });

  it('defaults: 1500 / 350 / 0.06, RD never above 350', () => {
    expect(GLICKO2_DEFAULTS).toMatchObject({ rating: 1500, rd: 350, volatility: 0.06 });
    expect(rate({ rating: 1500, rd: 350, volatility: 0.06 }, []).rd).toBe(350);
  });

  it('a win against a stronger opponent gains more than against a weaker one', () => {
    const start = { rating: 1500, rd: 100, volatility: 0.06 };
    const strong = rate(start, [{ opponent: { rating: 1800, rd: 50 }, score: 1 }]);
    const weak = rate(start, [{ opponent: { rating: 1200, rd: 50 }, score: 1 }]);
    expect(strong.rating - 1500).toBeGreaterThan(weak.rating - 1500);
    expect(weak.rating).toBeGreaterThan(1500);
  });

  it('rejects scores outside 0..1 and non-finite inputs', () => {
    expect(() => rate(player, [{ opponent: { rating: 1500, rd: 50 }, score: 2 }])).toThrow();
    expect(() => rate({ ...player, rating: Number.NaN }, [])).toThrow();
  });

  it('counts whole idle rating periods (weeks)', () => {
    const week = 7 * 86_400_000;
    expect(idlePeriods(new Date(0), new Date(week - 1))).toBe(0);
    expect(idlePeriods(new Date(0), new Date(3 * week + 5))).toBe(3);
    expect(idlePeriods(null, new Date())).toBe(0);
  });
});
