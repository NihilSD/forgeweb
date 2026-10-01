/**
 * Glicko-2 rating system (Mark Glickman, glicko.net/glicko/glicko2.pdf). Pure functions shared by
 * the API (rating updates, weekly problem recalculation) and the web (display).
 *
 * Forge uses one rating period per rated event, plus RD growth for each whole idle week before an
 * update (`idlePeriods`), so long breaks make a rating less certain. See ADR 0012.
 */

/** Conversion factor between the Glicko and Glicko-2 scales (400 / ln 10). */
const SCALE = 173.7178;
const EPSILON = 0.000001;

export const GLICKO2_DEFAULTS = {
  rating: 1500,
  rd: 350,
  volatility: 0.06,
  /** System constant: how much volatility may change. Glickman suggests 0.3–1.2. */
  tau: 0.5,
  /** Ratings are hidden until this many rated events (spec 8: placement). */
  placementEvents: 5,
} as const;

export interface Glicko2Player {
  rating: number;
  rd: number;
  volatility: number;
}
export interface Glicko2Opponent {
  rating: number;
  rd: number;
}
export interface Glicko2Game {
  opponent: Glicko2Opponent;
  /** 1 = win, 0.5 = draw, 0 = loss. */
  score: number;
}

export function toGlicko2Scale(rating: number, rd: number) {
  return { mu: (rating - 1500) / SCALE, phi: rd / SCALE };
}
export function fromGlicko2Scale(mu: number, phi: number) {
  return { rating: mu * SCALE + 1500, rd: phi * SCALE };
}

const g = (phi: number) => 1 / Math.sqrt(1 + (3 * phi * phi) / (Math.PI * Math.PI));
const expected = (mu: number, muJ: number, phiJ: number) =>
  1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));

function check(p: Glicko2Player, games: readonly Glicko2Game[]) {
  const finite = [
    p.rating,
    p.rd,
    p.volatility,
    ...games.flatMap((x) => [x.opponent.rating, x.opponent.rd, x.score]),
  ];
  if (!finite.every(Number.isFinite)) throw new RangeError('Glicko-2: non-finite input');
  if (p.rd <= 0 || p.volatility <= 0)
    throw new RangeError('Glicko-2: rd and volatility must be > 0');
  for (const x of games) {
    if (x.score < 0 || x.score > 1) throw new RangeError('Glicko-2: score must be within 0..1');
    if (x.opponent.rd <= 0) throw new RangeError('Glicko-2: opponent rd must be > 0');
  }
}

/** Steps 3–4, exposed for the reference-vector tests. */
export function glicko2Internals(p: Glicko2Player, games: readonly Glicko2Game[]) {
  const { mu } = toGlicko2Scale(p.rating, p.rd);
  const opp = games.map((x) => ({
    ...toGlicko2Scale(x.opponent.rating, x.opponent.rd),
    s: x.score,
  }));
  const gs = opp.map((o) => g(o.phi));
  const Es = opp.map((o) => expected(mu, o.mu, o.phi));
  const v = 1 / opp.reduce((sum, _o, i) => sum + gs[i]! ** 2 * Es[i]! * (1 - Es[i]!), 0);
  const delta = v * opp.reduce((sum, o, i) => sum + gs[i]! * (o.s - Es[i]!), 0);
  return { g: gs, E: Es, v, delta };
}

/** Step 5: the new volatility, by the Illinois algorithm. */
function newVolatility(phi: number, sigma: number, v: number, delta: number, tau: number) {
  const a = Math.log(sigma * sigma);
  const f = (x: number) =>
    (Math.exp(x) * (delta * delta - phi * phi - v - Math.exp(x))) /
      (2 * (phi * phi + v + Math.exp(x)) ** 2) -
    (x - a) / (tau * tau);
  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * tau) < 0) k++;
    B = a - k * tau;
  }
  let fA = f(A);
  let fB = f(B);
  for (let i = 0; Math.abs(B - A) > EPSILON && i < 100; i++) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
  }
  return Math.exp(A / 2);
}

/**
 * One rating period. With no games, only the RD grows (step 6). The RD is capped at the default
 * starting RD (350), as Glickman recommends for the original system.
 */
export function rate(
  p: Glicko2Player,
  games: readonly Glicko2Game[],
  opts: { tau?: number } = {},
): Glicko2Player {
  check(p, games);
  const tau = opts.tau ?? GLICKO2_DEFAULTS.tau;
  const { mu, phi } = toGlicko2Scale(p.rating, p.rd);
  const capPhi = GLICKO2_DEFAULTS.rd / SCALE;
  if (games.length === 0) {
    const phiStar = Math.min(Math.sqrt(phi * phi + p.volatility ** 2), capPhi);
    return { rating: p.rating, rd: phiStar * SCALE, volatility: p.volatility };
  }
  const { g: gs, E, v, delta } = glicko2Internals(p, games);
  const sigma = newVolatility(phi, p.volatility, v, delta, tau);
  const phiStar = Math.sqrt(phi * phi + sigma * sigma);
  const phiNew = Math.min(1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v), capPhi);
  const muNew =
    mu + phiNew * phiNew * games.reduce((sum, x, i) => sum + gs[i]! * (x.score - E[i]!), 0);
  const out = fromGlicko2Scale(muNew, phiNew);
  return { rating: out.rating, rd: out.rd, volatility: sigma };
}

/** RD growth for `periods` idle rating periods (step 6 applied repeatedly). */
export function inflate(p: Glicko2Player, periods: number): Glicko2Player {
  let cur = p;
  for (let i = 0; i < Math.min(periods, 520); i++) {
    if (cur.rd >= GLICKO2_DEFAULTS.rd) break;
    cur = rate(cur, []);
  }
  return cur;
}

const WEEK_MS = 7 * 86_400_000;
/** Whole weeks between the last rated event and now (one idle rating period per week). */
export function idlePeriods(last: Date | null, now: Date): number {
  if (!last) return 0;
  return Math.max(0, Math.floor((now.getTime() - last.getTime()) / WEEK_MS));
}
