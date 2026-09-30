import { resolve } from 'node:path';
import type { Submission } from '@forge/db';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { EntitlementsService } from '../src/entitlements/entitlements.service.js';
import { PracticeService } from '../src/practice/practice.service.js';
import { importProblems } from '../src/problems/importer.js';
import { createTestContext, createUser, type TestContext } from './helpers.js';

const ROOT = resolve(import.meta.dirname, '../../../content/problems');
let ctx: TestContext;
const proUsers = new Set<string>();

beforeAll(async () => {
  ctx = await createTestContext();
  const ent = ctx.app.get(EntitlementsService);
  // Until billing (L10) stores subscriptions, tests choose plans through the resolver seam.
  ent.planResolver = async (userId) => (proUsers.has(userId) ? 'pro' : 'free');
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await ctx.reset();
  proUsers.clear();
  await importProblems(ctx.prisma, ROOT, { publishDrafts: true });
});

/** Records a finished practice submission the way the runner callback would. */
async function finish(
  userId: string,
  slug: string,
  verdict: 'accepted' | 'wrong_answer',
  at = new Date(),
) {
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
      verdict,
      seed: 1,
      finishedAt: at,
      createdAt: at,
    },
  });
  await ctx.app.get(PracticeService).onSubmissionFinished(row, at);
}

describe('hint ladder', () => {
  it('reveals levels in order', async () => {
    const { client } = await createUser(ctx);
    const skip = await client.post('/problems/two-sum-orders/hints/2/reveal');
    expect(skip.status).toBe(400);
    const first = await client.post('/problems/two-sum-orders/hints/1/reveal');
    expect(first.status).toBe(200);
    expect(first.body.levels[0].text).toMatch(/voucher|price/i);
    expect(first.body.levels[1].revealed).toBe(false);
    expect(first.body.levels[1]).not.toHaveProperty('text');
  });

  it('limits Free users to 3 hint levels per day', async () => {
    const { client } = await createUser(ctx);
    for (const level of [1, 2, 3]) {
      expect((await client.post(`/problems/two-sum-orders/hints/${level}/reveal`)).status).toBe(
        200,
      );
    }
    const fourth = await client.post('/problems/two-sum-orders/hints/4/reveal');
    expect(fourth.status).toBe(403);
    expect(fourth.body.error.code).toBe('LIMIT_REACHED');
    // Re-reading an already revealed hint is free.
    const again = await client.get('/problems/two-sum-orders/hints');
    expect(again.body.levels.filter((l: { text?: string }) => l.text).length).toBe(3);
    expect(again.body.remainingToday).toBe(0);
  });

  it('gives Pro users unlimited hints', async () => {
    const { client, user } = await createUser(ctx);
    proUsers.add(user.id);
    for (const level of [1, 2, 3, 4]) {
      expect((await client.post(`/problems/two-sum-orders/hints/${level}/reveal`)).status).toBe(
        200,
      );
    }
    for (const level of [1, 2]) {
      expect((await client.post(`/problems/budget-window/hints/${level}/reveal`)).status).toBe(200);
    }
    expect((await client.get('/problems/two-sum-orders/hints')).body.remainingToday).toBeNull();
  });

  it('never returns hint text to anonymous users', async () => {
    expect((await ctx.client().get('/problems/two-sum-orders/hints')).status).toBe(401);
  });
});

describe('editorials', () => {
  it('require Pro', async () => {
    const { client, user } = await createUser(ctx);
    await client.post('/problems/two-sum-orders/give-up');
    const res = await client.get('/problems/two-sum-orders/editorial');
    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe('PLAN_REQUIRED');
    proUsers.add(user.id);
    expect((await client.get('/problems/two-sum-orders/editorial')).status).toBe(200);
  });

  it('stay locked until the user solves or gives up', async () => {
    const { client, user } = await createUser(ctx);
    proUsers.add(user.id);
    const locked = await client.get('/problems/budget-window/editorial');
    expect(locked.status).toBe(403);
    expect((await client.get('/problems/budget-window/progress')).body.editorialAvailable).toBe(
      false,
    );
    await finish(user.id, 'budget-window', 'accepted');
    const open = await client.get('/problems/budget-window/editorial');
    expect(open.status).toBe(200);
    expect(open.body.markdown).toMatch(/sliding window/i);
  });
});

describe('mastery', () => {
  it('rises when a problem is solved, less when hints were used', async () => {
    const a = await createUser(ctx);
    const b = await createUser(ctx);
    proUsers.add(b.user.id);
    await finish(a.user.id, 'two-sum-orders', 'accepted');
    for (const l of [1, 2, 3, 4]) await b.client.post(`/problems/two-sum-orders/hints/${l}/reveal`);
    await finish(b.user.id, 'two-sum-orders', 'accepted');
    const ma = (await a.client.get('/me/mastery')).body.items.find(
      (m: { tag: string }) => m.tag === 'hashing',
    );
    const mb = (await b.client.get('/me/mastery')).body.items.find(
      (m: { tag: string }) => m.tag === 'hashing',
    );
    expect(ma.points).toBeGreaterThan(0);
    expect(mb.points).toBeLessThan(ma.points);
    expect(ma.lastPracticed).not.toBeNull();
  });

  it('counts a solve only once', async () => {
    const { client, user } = await createUser(ctx);
    await finish(user.id, 'two-sum-orders', 'accepted');
    const once = (await client.get('/me/mastery')).body.items.find(
      (m: { tag: string }) => m.tag === 'hashing',
    ).points;
    await finish(user.id, 'two-sum-orders', 'accepted');
    const twice = (await client.get('/me/mastery')).body.items.find(
      (m: { tag: string }) => m.tag === 'hashing',
    ).points;
    expect(twice).toBe(once);
  });

  it('caps at level 5 and lists every allowed tag on the skill map', async () => {
    const { client } = await createUser(ctx);
    const items = (await client.get('/me/mastery')).body.items;
    expect(items.length).toBeGreaterThan(20);
    expect(items.every((m: { level: number }) => m.level >= 0 && m.level <= 5)).toBe(true);
  });
});

describe('review queue', () => {
  const DAY = 86_400_000;

  it('schedules struggled problems after 2, 7 and 21 days', async () => {
    const { client, user } = await createUser(ctx);
    proUsers.add(user.id);
    const t0 = new Date('2026-09-01T10:00:00Z');
    // Three failed submits before solving = struggled.
    for (let i = 0; i < 3; i++) await finish(user.id, 'budget-window', 'wrong_answer', t0);
    await finish(user.id, 'budget-window', 'accepted', t0);
    let item = await ctx.prisma.reviewItem.findFirstOrThrow({ where: { userId: user.id } });
    expect(item.stage).toBe(0);
    expect(item.dueAt.getTime()).toBe(t0.getTime() + 2 * DAY);

    // Solving again before it is due doesn't advance it.
    await finish(user.id, 'budget-window', 'accepted', new Date(t0.getTime() + DAY));
    item = await ctx.prisma.reviewItem.findFirstOrThrow({ where: { userId: user.id } });
    expect(item.stage).toBe(0);

    const t2 = new Date(t0.getTime() + 2 * DAY + 1000);
    await finish(user.id, 'budget-window', 'accepted', t2);
    item = await ctx.prisma.reviewItem.findFirstOrThrow({ where: { userId: user.id } });
    expect(item.stage).toBe(1);
    expect(item.dueAt.getTime()).toBe(t2.getTime() + 7 * DAY);

    const t3 = new Date(t2.getTime() + 7 * DAY);
    await finish(user.id, 'budget-window', 'accepted', t3);
    item = await ctx.prisma.reviewItem.findFirstOrThrow({ where: { userId: user.id } });
    expect(item.stage).toBe(2);
    expect(item.dueAt.getTime()).toBe(t3.getTime() + 21 * DAY);

    await finish(user.id, 'budget-window', 'accepted', new Date(t3.getTime() + 21 * DAY));
    item = await ctx.prisma.reviewItem.findFirstOrThrow({ where: { userId: user.id } });
    expect(item.stage).toBe(3);
    expect(item.completedAt).not.toBeNull();
    expect((await client.get('/me/review')).body.items).toEqual([]);
  });

  it('adds problems the user gave up on', async () => {
    const { client, user } = await createUser(ctx);
    proUsers.add(user.id);
    await client.post('/problems/two-sum-orders/give-up');
    const queue = await client.get('/me/review');
    expect(queue.body.items).toHaveLength(1);
    expect(queue.body.items[0].slug).toBe('two-sum-orders');
    expect(queue.body.items[0].due).toBe(false);
  });

  it('is a Pro feature', async () => {
    const { client } = await createUser(ctx);
    expect((await client.get('/me/review')).body.error.code).toBe('PLAN_REQUIRED');
  });
});

describe('bookmarks and notes', () => {
  it('are private to each user', async () => {
    const a = await createUser(ctx);
    const b = await createUser(ctx);
    await a.client.req('put', '/problems/two-sum-orders/bookmark');
    await a.client.req('put', '/problems/two-sum-orders/note', { text: 'use a dict' });
    expect(
      (await a.client.get('/me/bookmarks')).body.items.map((x: { slug: string }) => x.slug),
    ).toEqual(['two-sum-orders']);
    expect((await a.client.get('/problems/two-sum-orders/progress')).body.note).toBe('use a dict');
    expect((await b.client.get('/me/bookmarks')).body.items).toEqual([]);
    expect((await b.client.get('/problems/two-sum-orders/progress')).body.note).toBe('');
    await a.client.delete('/problems/two-sum-orders/bookmark');
    expect((await a.client.get('/me/bookmarks')).body.items).toEqual([]);
  });
});

describe('recommendations', () => {
  it('suggests unsolved problems in the weakest concepts first, and due reviews before anything', async () => {
    const { client, user } = await createUser(ctx);
    proUsers.add(user.id);
    const first = await client.get('/me/recommendations');
    expect(first.body.items.length).toBeGreaterThan(0);
    await finish(user.id, 'two-sum-orders', 'accepted');
    const next = await client.get('/me/recommendations');
    expect(next.body.items.map((r: { slug: string }) => r.slug)).not.toContain('two-sum-orders');

    await client.post('/problems/budget-window/give-up');
    await ctx.prisma.reviewItem.updateMany({ data: { dueAt: new Date(Date.now() - 1000) } });
    const withReview = await client.get('/me/recommendations');
    expect(withReview.body.items[0].slug).toBe('budget-window');
    expect(withReview.body.items[0].reason).toMatch(/review/i);
  });
});

describe('entitlements', () => {
  it('are readable by the web app to show locks', async () => {
    const { client, user } = await createUser(ctx);
    expect((await client.get('/me/entitlements')).body).toMatchObject({
      plan: 'free',
      hintLevelsPerDay: 3,
      verifiedPerWeek: 3,
    });
    proUsers.add(user.id);
    expect((await client.get('/me/entitlements')).body.plan).toBe('pro');
  });
});

describe('courses', () => {
  beforeEach(async () => {
    const { importCourses } = await import('../src/courses/course-importer.js');
    await importCourses(ctx.prisma, resolve(ROOT, '../courses'), { publishDrafts: true });
  });

  it('lists courses and lessons; lesson exercises stay out of the library', async () => {
    const list = await ctx.client().get('/courses');
    expect(list.body.items.map((c: { slug: string }) => c.slug)).toEqual([
      'python-basics',
      'javascript-basics',
      'sql-basics',
      'core-patterns',
    ]);
    const library = await ctx.client().get('/problems?limit=100');
    expect(library.body.items.some((p: { slug: string }) => p.slug.startsWith('lesson-'))).toBe(
      false,
    );
    expect((await ctx.client().get('/problems/lesson-py-sum-positives')).status).toBe(200);
  });

  it('gives Free the first three lessons and Pro all of them', async () => {
    const { client, user } = await createUser(ctx);
    const detail = await client.get('/courses/python-basics');
    expect(detail.body.lessons.map((l: { locked: boolean }) => l.locked)).toEqual([
      false,
      false,
      false,
      true,
    ]);
    const locked = await client.get('/courses/python-basics/lessons/lists');
    expect(locked.status).toBe(402);
    expect((await ctx.client().get('/courses/python-basics/lessons/lists')).status).toBe(402);
    proUsers.add(user.id);
    expect((await client.get('/courses/python-basics/lessons/lists')).status).toBe(200);
  });

  it('completes a lesson only after its exercise is solved', async () => {
    const { client, user } = await createUser(ctx);
    const lesson = await client.get('/courses/python-basics/lessons/numbers-and-loops');
    expect(lesson.body.exercises).toEqual([{ slug: 'lesson-py-sum-positives', solved: false }]);
    expect(lesson.body.next).toBe('conditions');
    const early = await client.post('/courses/python-basics/lessons/numbers-and-loops/complete');
    expect(early.status).toBe(409);
    await finish(user.id, 'lesson-py-sum-positives', 'accepted');
    const done = await client.post('/courses/python-basics/lessons/numbers-and-loops/complete');
    expect(done.status).toBe(200);
    expect(done.body.completed).toBe(true);
    expect((await client.get('/courses')).body.items[0].completedCount).toBe(1);
  });
});
