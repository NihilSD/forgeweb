/**
 * Spec V1.1: per-track Glicko-2 ratings. Acceptance: "Ratings can't be changed by any Practice
 * activity". Also: only final verified results count, updates are idempotent, placement hides the
 * rating for 5 events, abandoned attempts can't dodge a loss, and the weekly problem-rating job.
 */
import { resolve } from 'node:path';
import type { AttemptStatus } from '@forge/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AttemptsService } from '../src/attempts/attempts.service.js';
import { EngagementService } from '../src/engagement/engagement.service.js';
import { importProblems } from '../src/problems/importer.js';
import { ProblemRatingService } from '../src/ratings/problem-rating.service.js';
import { RatingsService } from '../src/ratings/ratings.service.js';
import { FakeRunner, waitDone } from './fake-runner.js';
import { createTestContext, createUser, type TestContext } from './helpers.js';

const ROOT = resolve(import.meta.dirname, '../../../content/problems');
let ctx: TestContext;
let runner: FakeRunner;

beforeAll(async () => {
  ctx = await createTestContext();
  runner = new FakeRunner(ctx.app).start();
});
afterAll(async () => {
  await runner.stop();
  await ctx.close();
});
beforeEach(async () => {
  await ctx.reset();
  await importProblems(ctx.prisma, ROOT, { publishDrafts: true });
});

const ratings = () => ctx.app.get(RatingsService);
const DAY = 86_400_000;

async function problem(slug = 'two-sum-orders') {
  return ctx.prisma.problem.findUniqueOrThrow({ where: { slug }, include: { track: true } });
}

/** A finished attempt row, as the attempt flow leaves it. */
async function attempt(
  userId: string,
  status: AttemptStatus,
  opts: { slug?: string; finishedAt?: Date; endsAt?: Date } = {},
) {
  const p = await problem(opts.slug);
  const finishedAt = opts.finishedAt ?? new Date();
  return ctx.prisma.attempt.create({
    data: {
      userId,
      problemId: p.id,
      version: p.version,
      language: 'python',
      seed: Math.floor(Math.random() * 2 ** 31),
      instanceHash: `h${Math.random()}`,
      consentAt: new Date(finishedAt.getTime() - 3_600_000),
      startedAt: new Date(finishedAt.getTime() - 3_600_000),
      endsAt: opts.endsAt ?? new Date(finishedAt.getTime() - 60_000),
      status,
      finishedAt: status === 'in_progress' ? null : finishedAt,
      score: status === 'verified' ? 100 : null,
    },
  });
}

describe('rating updates from verified challenges', () => {
  it('a verified solve is a win against the problem; idempotent per attempt', async () => {
    const { user } = await createUser(ctx);
    const a = await attempt(user.id, 'verified');
    expect(await ratings().applyAttempt(a.id)).toBe('applied');
    expect(await ratings().applyAttempt(a.id)).toBe('duplicate');

    const row = await ctx.prisma.rating.findFirstOrThrow({ where: { userId: user.id } });
    expect(row.events).toBe(1);
    expect(row.rating).toBeGreaterThan(1500);
    expect(row.rd).toBeLessThan(350);
    const changes = await ctx.prisma.ratingChange.findMany({ where: { userId: user.id } });
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      eventKey: `attempt:${a.id}`,
      kind: 'verified',
      score: 1,
      ratingBefore: 1500,
      opponent: (await problem()).rating,
    });
  });

  it('an attempt that ran out of time is a loss', async () => {
    const { user } = await createUser(ctx);
    const a = await attempt(user.id, 'expired');
    await ratings().applyAttempt(a.id);
    const row = await ctx.prisma.rating.findFirstOrThrow({ where: { userId: user.id } });
    expect(row.rating).toBeLessThan(1500);
  });

  it('unverified, in-review and appealed results never count; open attempts neither', async () => {
    const { user } = await createUser(ctx);
    for (const status of [
      'unverified',
      'review',
      'appealed',
      'in_progress',
      'followups',
    ] as const) {
      const a = await attempt(user.id, status, { endsAt: new Date(Date.now() + 3_600_000) });
      expect(await ratings().applyAttempt(a.id)).toBe('skipped');
    }
    expect(await ctx.prisma.rating.count()).toBe(0);
    expect(await ctx.prisma.ratingChange.count()).toBe(0);
  });

  it('a result cleared by a moderator counts once it is verified', async () => {
    const { user } = await createUser(ctx);
    const a = await attempt(user.id, 'review');
    expect(await ratings().applyAttempt(a.id)).toBe('skipped');
    await ctx.prisma.attempt.update({ where: { id: a.id }, data: { status: 'verified' } });
    expect(await ratings().applyAttempt(a.id)).toBe('applied');
  });

  it('hides the rating until 5 rated events (placement), then shows it with its history', async () => {
    const { user, client } = await createUser(ctx);
    const track = (await problem()).track.slug;
    for (let i = 0; i < 4; i++) {
      const a = await attempt(user.id, i % 2 ? 'expired' : 'verified', {
        finishedAt: new Date(Date.now() - (10 - i) * DAY),
      });
      await ratings().applyAttempt(a.id);
    }
    let res = await client.get('/me/ratings');
    expect(res.status).toBe(200);
    let entry = res.body.tracks.find((t: { track: { slug: string } }) => t.track.slug === track);
    expect(entry).toMatchObject({ rating: null, events: 4, placementRemaining: 1, history: [] });
    // Nothing about the hidden value leaks.
    expect(JSON.stringify(entry)).not.toMatch(/"rd"|ratingAfter|ratingBefore/);

    const a = await attempt(user.id, 'verified');
    await ratings().applyAttempt(a.id);
    res = await client.get('/me/ratings');
    entry = res.body.tracks.find((t: { track: { slug: string } }) => t.track.slug === track);
    expect(entry.rating).toEqual(expect.any(Number));
    expect(entry.placementRemaining).toBe(0);
    expect(entry.history).toHaveLength(5);
    expect(entry.history.map((h: { at: string }) => h.at)).toEqual(
      [...entry.history.map((h: { at: string }) => h.at)].sort(),
    );
    expect(entry.history[4]).toMatchObject({
      problem: { slug: 'two-sum-orders' },
      result: 'solved',
    });
  });

  it('only the owner sees their ratings; signed-out requests are refused', async () => {
    const { client } = await createUser(ctx);
    expect((await client.get('/me/ratings')).status).toBe(200);
    expect((await ctx.client().get('/me/ratings')).status).toBe(401);
  });

  it('an idle month makes the rating less certain before the next update', async () => {
    const { user } = await createUser(ctx);
    const first = await attempt(user.id, 'verified', {
      finishedAt: new Date(Date.now() - 60 * DAY),
    });
    await ratings().applyAttempt(first.id);
    const before = await ctx.prisma.rating.findFirstOrThrow({ where: { userId: user.id } });
    const second = await attempt(user.id, 'verified');
    await ratings().applyAttempt(second.id);
    const change = await ctx.prisma.ratingChange.findFirstOrThrow({
      where: { eventKey: `attempt:${second.id}` },
    });
    expect(change.rdBefore).toBeGreaterThan(before.rd);
  });
});

describe('abandoned attempts and lost jobs', () => {
  it('the sweeper expires attempts past their time, and the loss is rated', async () => {
    const { user } = await createUser(ctx);
    const a = await attempt(user.id, 'in_progress', { endsAt: new Date(Date.now() - 10 * 60_000) });
    expect(await ctx.app.get(AttemptsService).expireStale()).toBe(1);
    expect((await ctx.prisma.attempt.findUniqueOrThrow({ where: { id: a.id } })).status).toBe(
      'expired',
    );
    // The final-result hook queued it; the worker applies it.
    await ratings().drain();
    const change = await ctx.prisma.ratingChange.findFirstOrThrow({
      where: { eventKey: `attempt:${a.id}` },
    });
    expect(change.score).toBe(0);
  });

  it('the reconciler queues final results that never reached the queue', async () => {
    const { user } = await createUser(ctx);
    const a = await attempt(user.id, 'verified'); // written directly: no hook fired
    expect(await ratings().reconcile()).toBe(1);
    await ratings().drain();
    expect(await ctx.prisma.ratingChange.count({ where: { eventKey: `attempt:${a.id}` } })).toBe(1);
    expect(await ratings().reconcile()).toBe(0);
  });
});

describe('practice never changes ratings (spec V1.1 acceptance)', () => {
  it('accepted practice submits, flags, lessons, daily and hints leave ratings untouched', async () => {
    const { user, client } = await createUser(ctx);
    // An accepted practice submit (also the daily challenge, XP and streak paths).
    const sub = await client.post('/problems/two-sum-orders/submit', {
      language: 'python',
      code: [
        'def match_orders(amounts, target):',
        '    seen = {}',
        '    for j, amount in enumerate(amounts):',
        '        if target - amount in seen:',
        '            return [seen[target - amount], j]',
        '        seen[amount] = j',
        '    return []',
        '',
      ].join('\n'),
    });
    expect(sub.status, JSON.stringify(sub.body)).toBe(202);
    const done = await waitDone((p) => client.get(p), sub.body.id);
    expect(done.body.verdict).toBe('accepted');
    // A failing practice submit too.
    const bad = await client.post('/problems/two-sum-orders/submit', {
      language: 'python',
      code: 'def match_orders(amounts, target):\n    return []\n',
    });
    await waitDone((p) => client.get(p), bad.body.id);
    // A hint, a lesson and engagement events.
    await client.post('/problems/two-sum-orders/hints/1/reveal');
    await ctx.app.get(EngagementService).onSolved(user.id, (await problem()).id, new Date(), {
      practice: true,
    });

    // Even when the reconciler runs and the queue drains, nothing is rated.
    expect(await ratings().reconcile()).toBe(0);
    await ratings().drain();
    // And the service refuses a practice submission id passed where an attempt is expected.
    expect(await ratings().applyAttempt(sub.body.id)).toBe('skipped');

    expect(await ctx.prisma.rating.count()).toBe(0);
    expect(await ctx.prisma.ratingChange.count()).toBe(0);
    const res = await client.get('/me/ratings');
    for (const t of res.body.tracks) expect(t).toMatchObject({ rating: null, events: 0 });
  });
});

describe('weekly problem rating recalculation', () => {
  it('moves a problem down when verified attempts mostly solve it, and runs once per week', async () => {
    const p = await problem();
    const start = p.rating;
    for (let i = 0; i < 6; i++) {
      const { user } = await createUser(ctx);
      const a = await attempt(user.id, 'verified', { finishedAt: new Date(Date.now() - DAY) });
      await ratings().applyAttempt(a.id);
    }
    const job = ctx.app.get(ProblemRatingService);
    const now = new Date();
    expect(await job.run(now)).toMatchObject({ ran: true });
    const after = await problem();
    expect(after.rating).toBeLessThan(start);
    expect(after.ratingDeviation).toBeLessThan(200);
    expect(await job.run(now)).toMatchObject({ ran: false });

    // A content re-import never resets the recalculated rating.
    await importProblems(ctx.prisma, ROOT, { publishDrafts: true });
    expect((await problem()).rating).toBe(after.rating);
  });

  it('moves a problem up when attempts mostly fail, and ignores unrated results', async () => {
    const p = await problem('maze-shortest-path');
    for (let i = 0; i < 6; i++) {
      const { user } = await createUser(ctx);
      const a = await attempt(user.id, 'expired', {
        slug: 'maze-shortest-path',
        finishedAt: new Date(Date.now() - DAY),
      });
      await ratings().applyAttempt(a.id);
      await attempt(user.id, 'unverified', { slug: 'maze-shortest-path' });
    }
    await ctx.app.get(ProblemRatingService).run(new Date());
    expect((await problem('maze-shortest-path')).rating).toBeGreaterThan(p.rating);
  });
});
