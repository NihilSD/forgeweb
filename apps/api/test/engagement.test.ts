/**
 * Spec L9: daily challenge, XP and streaks. Acceptance: the daily challenge changes at midnight UTC
 * and every user gets a valid instance; streaks hold across time zones and midnight boundaries.
 */
import { resolve } from 'node:path';
import type { Submission } from '@forge/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DailyService, pickDaily, utcDate } from '../src/engagement/daily.service.js';
import { EngagementService } from '../src/engagement/engagement.service.js';
import { EntitlementsService } from '../src/entitlements/entitlements.service.js';
import { ContentService } from '../src/problems/content.service.js';
import { importProblems } from '../src/problems/importer.js';
import { SubmissionsService } from '../src/submissions/submissions.service.js';
import { createTestContext, createUser, type TestContext } from './helpers.js';

const ROOT = resolve(import.meta.dirname, '../../../content/problems');
let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await ctx.reset();
  await importProblems(ctx.prisma, ROOT, { publishDrafts: true });
  ctx.app.get(EntitlementsService).planResolver = async () => 'free';
});

/** A finished submission, passed through every submission hook (practice, XP, streak, daily). */
async function finish(userId: string, slug: string, at = new Date(), attemptId?: string) {
  const p = await ctx.prisma.problem.findUniqueOrThrow({ where: { slug } });
  const row: Submission = await ctx.prisma.submission.create({
    data: {
      userId,
      problemId: p.id,
      version: p.version,
      language: 'python',
      code: '...',
      kind: 'submit',
      status: 'done',
      verdict: 'accepted',
      seed: 1,
      finishedAt: at,
      createdAt: at,
      ...(attemptId ? { attemptId } : {}),
    },
  });
  for (const h of ctx.app.get(SubmissionsService).hooks) await h.onFinished?.(row);
}

async function xp(userId: string) {
  return ctx.prisma.xpEvent.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
}

describe('daily challenge', () => {
  it('rotates through the queue without repeating yesterday', () => {
    const eligible = ['a', 'b', 'c'].map((slug) => ({ id: slug, slug }));
    const history: { problemId: string; date: string }[] = [];
    for (let d = 1; d <= 12; d++) {
      const date = `2026-05-${String(d).padStart(2, '0')}`;
      const id = pickDaily(date, eligible, history)!;
      if (history.length) expect(id).not.toBe(history.at(-1)!.problemId);
      history.push({ problemId: id, date });
    }
    for (const p of eligible) expect(history.filter((h) => h.problemId === p.id)).toHaveLength(4);
    expect(pickDaily('2026-06-01', [], [])).toBeNull();
    // Deterministic for a date.
    expect(pickDaily('2026-06-01', eligible, history)).toBe(
      pickDaily('2026-06-01', eligible, history),
    );
  });

  it('changes at midnight UTC, once per track, and is the same all day', async () => {
    const daily = ctx.app.get(DailyService);
    const before = await daily.today(null, new Date('2026-10-01T23:59:59.999Z'));
    const sameDay = await daily.today(null, new Date('2026-10-01T00:00:00.000Z'));
    const after = await daily.today(null, new Date('2026-10-02T00:00:00.000Z'));
    expect(before.date).toBe('2026-10-01');
    expect(after.date).toBe('2026-10-02');
    expect(before.resetsAt).toBe('2026-10-02T00:00:00.000Z');
    expect(sameDay.items).toEqual(before.items);
    const tracks = await ctx.prisma.track.findMany();
    expect(new Set(before.items.map((i) => i.track)).size).toBe(before.items.length);
    expect(before.items.length).toBe(tracks.length);
    // Every track with more than one listed problem gets a different one the next day.
    for (const item of before.items) {
      const eligible = await ctx.prisma.problem.count({
        where: { track: { slug: item.track }, listed: true, mode: { in: ['practice', 'both'] } },
      });
      const next = after.items.find((i) => i.track === item.track)!;
      if (eligible > 1) expect(next.slug).not.toBe(item.slug);
    }
    // Lesson exercises and competitive-only templates never become dailies.
    const slugs = [...before.items, ...after.items].map((i) => i.slug);
    expect(slugs.some((s) => s.startsWith('lesson-'))).toBe(false);
    // Concurrent schedulers don't create duplicates.
    await Promise.all([daily.ensure('2026-10-03'), daily.ensure('2026-10-03')]);
    expect(await ctx.prisma.dailyChallenge.count({ where: { date: '2026-10-03' } })).toBe(
      tracks.length,
    );
  });

  it('gives every user a valid instance of the daily template', async () => {
    const daily = await ctx.app.get(DailyService).today(null, new Date('2026-10-05T12:00:00Z'));
    const content = ctx.app.get(ContentService);
    for (const item of daily.items) {
      const problem = await content.getPublished(item.slug);
      const statements = new Set<string>();
      for (let u = 0; u < 25; u++) {
        const userId = `00000000-0000-4000-8000-${String(u).padStart(12, '0')}`;
        const gen = await content.instance(
          problem.current,
          content.practiceSeed(userId, problem.id),
        );
        if (item.format === 'flag') {
          expect(Object.keys(gen.instance.files ?? {}).length).toBeGreaterThan(0);
        } else {
          expect(gen.suite.visible.length).toBeGreaterThan(0);
          expect(gen.suite.hidden.length).toBeGreaterThan(0);
        }
        statements.add(content.renderStatement(problem.current, gen));
      }
      // Same template, unique instances.
      expect(statements.size).toBeGreaterThan(1);
    }
  });

  it('is public and shows what the signed-in user solved today', async () => {
    const anon = await ctx.client().get('/daily');
    expect(anon.status).toBe(200);
    expect(anon.body.items.every((i: { solved: boolean }) => !i.solved)).toBe(true);
    const { client, user } = await createUser(ctx);
    const first = anon.body.items[0] as { slug: string };
    await finish(user.id, first.slug);
    const mine = await client.get('/daily');
    expect(mine.body.items[0].solved).toBe(true);
  });
});

describe('XP', () => {
  it('awards solve XP once, minus hints, plus the daily bonus', async () => {
    const { client, user } = await createUser(ctx);
    const today = await ctx.app.get(DailyService).today(null);
    const dailySlug = today.items.find((i) => i.format !== 'flag')!.slug;
    const daily = await ctx.prisma.problem.findUniqueOrThrow({ where: { slug: dailySlug } });

    // One hint level on another problem: 25% off.
    const other = await ctx.prisma.problem.findFirstOrThrow({
      where: {
        slug: { notIn: today.items.map((i) => i.slug) },
        listed: true,
        difficulty: 'medium',
        formats: { has: 'write-code' },
      },
    });
    expect((await client.post(`/problems/${other.slug}/hints/1/reveal`)).status).toBe(200);
    await finish(user.id, other.slug);
    await finish(user.id, other.slug); // a second solve earns nothing new
    await finish(user.id, dailySlug);

    const events = await xp(user.id);
    expect(events.map((e) => [e.reason, e.amount])).toEqual([
      ['solve', 15],
      ['solve', { easy: 10, medium: 20, hard: 40, expert: 80 }[daily.difficulty]],
      ['daily', 10],
    ]);
    const progress = await client.get('/me/progress');
    expect(progress.status).toBe(200);
    expect(progress.body.xp).toBe(events.reduce((s, e) => s + e.amount, 0));
    expect(progress.body.solved).toBe(2);
    expect(progress.body.streak).toMatchObject({
      current: 1,
      activeToday: true,
      freezesPerMonth: 2,
    });
  });

  it('awards lesson XP and counts verified solves for streaks but not XP', async () => {
    const { user } = await createUser(ctx);
    const engagement = ctx.app.get(EngagementService);
    await engagement.onLessonCompleted(user.id, 'lesson-1', new Date());
    await engagement.onLessonCompleted(user.id, 'lesson-1', new Date());
    const p = await ctx.prisma.problem.findFirstOrThrow({ where: { slug: 'two-sum-orders' } });
    const attempt = await ctx.prisma.attempt.create({
      data: {
        userId: user.id,
        problemId: p.id,
        version: 1,
        language: 'python',
        seed: 7,
        instanceHash: 'x',
        consentAt: new Date(),
        startedAt: new Date(),
        endsAt: new Date(Date.now() + 60_000),
      },
    });
    await finish(user.id, 'two-sum-orders', new Date(), attempt.id);
    expect((await xp(user.id)).map((e) => [e.reason, e.amount])).toEqual([['lesson', 5]]);
    expect(
      (await ctx.prisma.streak.findUniqueOrThrow({ where: { userId: user.id } })).current,
    ).toBe(1);
  });

  it('awards XP for a correct flag', async () => {
    const { user } = await createUser(ctx);
    const caesar = await ctx.prisma.problem.findUniqueOrThrow({
      where: { slug: 'caesar-intercept' },
    });
    await ctx.app.get(EngagementService).onFlagSolved(user.id, caesar, new Date());
    expect((await xp(user.id)).map((e) => e.reason)).toContain('solve');
  });
});

describe('streaks', () => {
  async function userIn(timeZone: string) {
    const { client, user } = await createUser(ctx);
    await ctx.prisma.user.update({ where: { id: user.id }, data: { timeZone } });
    return { client, user: { ...user, timeZone } };
  }

  it('follows the user time zone across local and UTC midnight', async () => {
    const engagement = ctx.app.get(EngagementService);
    // Auckland (UTC+13 in January): 23:30 and 00:30 local, the same UTC day.
    const nz = await userIn('Pacific/Auckland');
    await engagement.recordActivity(nz.user.id, new Date('2026-01-10T10:30:00Z'));
    await engagement.recordActivity(nz.user.id, new Date('2026-01-10T11:30:00Z'));
    expect(
      (await ctx.prisma.streak.findUniqueOrThrow({ where: { userId: nz.user.id } })).current,
    ).toBe(2);
    // Los Angeles (UTC-8): 16:30 and 17:30 local, across UTC midnight: one day.
    const la = await userIn('America/Los_Angeles');
    await engagement.recordActivity(la.user.id, new Date('2026-01-10T23:30:00Z'));
    await engagement.recordActivity(la.user.id, new Date('2026-01-11T01:30:00Z'));
    expect(
      (await ctx.prisma.streak.findUniqueOrThrow({ where: { userId: la.user.id } })).current,
    ).toBe(1);
  });

  it('shows today’s streak in local time and uses freezes by plan', async () => {
    const engagement = ctx.app.get(EngagementService);
    const { user } = await userIn('Asia/Tokyo');
    for (const iso of ['2026-05-01T03:00:00Z', '2026-05-02T03:00:00Z'])
      await engagement.recordActivity(user.id, new Date(iso));
    const full = await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    // 4 May in Tokyo: 3 May was missed, covered by one of the two Free freezes.
    let p = await engagement.progress(full, new Date('2026-05-04T03:00:00Z'));
    expect(p.streak).toMatchObject({ current: 2, activeToday: false, freezesLeft: 2 });
    // 6 May: three missed days is more than two freezes.
    p = await engagement.progress(full, new Date('2026-05-06T03:00:00Z'));
    expect(p.streak.current).toBe(0);
    // Pro has 5 freezes a month.
    ctx.app.get(EntitlementsService).planResolver = async () => 'pro';
    p = await engagement.progress(full, new Date('2026-05-06T03:00:00Z'));
    expect(p.streak).toMatchObject({ current: 2, freezesPerMonth: 5 });
  });

  it('is safe under concurrent activity', async () => {
    const engagement = ctx.app.get(EngagementService);
    const { user } = await userIn('UTC');
    const at = new Date('2026-07-01T12:00:00Z');
    await Promise.all(Array.from({ length: 5 }, () => engagement.recordActivity(user.id, at)));
    expect(
      (await ctx.prisma.streak.findUniqueOrThrow({ where: { userId: user.id } })).current,
    ).toBe(1);
    expect(utcDate(at)).toBe('2026-07-01');
  });
});
