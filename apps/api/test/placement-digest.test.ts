/**
 * Spec L9 steps 3–4: placement quiz sets starting mastery; weekly progress email is opt-in, never
 * nags, and has one-click unsubscribe.
 */
import { resolve } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DigestService } from '../src/engagement/digest.service.js';
import { EngagementService } from '../src/engagement/engagement.service.js';
import { importPlacement } from '../src/engagement/placement.service.js';
import { createTestContext, createUser, type TestContext } from './helpers.js';

const QUIZ = resolve(import.meta.dirname, '../../../content/placement/quiz.yaml');
let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await ctx.reset();
});

describe('placement quiz', () => {
  it('is hidden until the quiz is approved or drafts are published', async () => {
    expect(await importPlacement(ctx.prisma, QUIZ)).toBe(10);
    const { client } = await createUser(ctx);
    expect((await client.get('/placement')).body.questions).toEqual([]);
    expect((await client.post('/placement', { answers: {} })).status).toBe(404);
  });

  it('serves 10 questions without answers and sets starting mastery once', async () => {
    await importPlacement(ctx.prisma, QUIZ, { publishDrafts: true });
    const { client, user } = await createUser(ctx);
    const quiz = await client.get('/placement');
    expect(quiz.body.status).toBe('none');
    expect(quiz.body.questions).toHaveLength(10);
    expect(JSON.stringify(quiz.body)).not.toMatch(/"answer"/);

    // Existing mastery is never lowered.
    await ctx.prisma.mastery.create({
      data: { userId: user.id, tag: 'hashing', points: 60, level: 3 },
    });
    const rows = await ctx.prisma.placementQuestion.findMany();
    const answers = Object.fromEntries(
      rows.map((q) => [q.id, q.tag === 'joins' ? (q.answer + 1) % q.options.length : q.answer]),
    );
    const res = await client.post('/placement', { answers });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ score: 9, total: 10 });
    expect(res.body.tags.find((t: { tag: string }) => t.tag === 'joins').correct).toBe(false);

    const mastery = await client.get('/me/mastery');
    const level = (tag: string) =>
      mastery.body.items.find((i: { tag: string }) => i.tag === tag)?.level ?? 0;
    expect(level('arrays')).toBe(1);
    expect(level('joins')).toBe(0);
    expect(level('hashing')).toBe(3);

    expect((await client.post('/placement', { answers })).status).toBe(409);
    expect((await client.get('/placement')).body.status).toBe('taken');
    expect((await client.get('/me/progress')).body.placement).toBe('taken');
  });

  it('can be skipped, and validates answers', async () => {
    await importPlacement(ctx.prisma, QUIZ, { publishDrafts: true });
    const { client } = await createUser(ctx);
    expect((await client.post('/placement', { answers: { 'arrays-index': 99 } })).status).toBe(400);
    expect((await client.post('/placement/skip')).status).toBe(200);
    expect((await client.get('/placement')).body.status).toBe('skipped');
  });
});

describe('weekly progress email', () => {
  // Monday 5 October 2026, 09:30 in Bucharest (UTC+3).
  const MONDAY = new Date('2026-10-05T06:30:00Z');

  async function optedIn(opts: { optIn?: boolean; active?: boolean; timeZone?: string } = {}) {
    const { client, user, email } = await createUser(ctx);
    await ctx.prisma.user.update({
      where: { id: user.id },
      data: { emailDigestOptIn: opts.optIn ?? true, timeZone: opts.timeZone ?? 'Europe/Bucharest' },
    });
    if (opts.active ?? true) {
      await ctx.app
        .get(EngagementService)
        .award(user.id, 20, 'solve', 'solve:x', new Date(MONDAY.getTime() - 2 * 86_400_000));
    }
    ctx.emails.outbox.length = 0;
    return { client, user, email };
  }

  it('is sent once on Monday morning local time, only to opted-in active users', async () => {
    const yes = await optedIn();
    const off = await optedIn({ optIn: false });
    const idle = await optedIn({ active: false });
    // Still Sunday evening in Los Angeles at this instant.
    const la = await optedIn({ timeZone: 'America/Los_Angeles' });
    const digest = ctx.app.get(DigestService);

    expect(await digest.sendDue(new Date('2026-10-05T05:30:00Z'))).toBe(0); // 08:30 local
    expect(await digest.sendDue(MONDAY)).toBe(1);
    expect(await digest.sendDue(new Date(MONDAY.getTime() + 3_600_000))).toBe(0);
    const to = ctx.emails.outbox.map((m) => m.to);
    expect(to).toEqual([yes.email]);
    expect(to).not.toContain(off.email);
    expect(to).not.toContain(idle.email);
    expect(to).not.toContain(la.email);

    const mail = ctx.emails.outbox[0]!;
    expect(mail.subject).toBe('Your week on Forge');
    expect(mail.text).toContain('XP earned: 20');
    // No guilt: nothing about losing streaks or falling behind.
    expect(mail.text).not.toMatch(/lose|losing|miss|behind|don't break/i);
    expect(mail.headers?.['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(mail.headers?.['List-Unsubscribe']).toMatch(/\/api\/v1\/email\/unsubscribe\?token=/);
    // Next Monday is a new week.
    expect(await digest.sendDue(new Date(MONDAY.getTime() + 7 * 86_400_000 + 60_000))).toBe(0);
  });

  it('unsubscribes with one click from the header link, without a session or CSRF token', async () => {
    const { user } = await optedIn();
    await ctx.app.get(DigestService).sendDue(MONDAY);
    const header = ctx.emails.outbox[0]!.headers!['List-Unsubscribe']!;
    const url = new URL(header.slice(1, -1));
    const res = await request(ctx.app.getHttpServer())
      .post(`${url.pathname}${url.search}`)
      .set('content-type', 'application/x-www-form-urlencoded')
      .send('List-Unsubscribe=One-Click');
    expect(res.status).toBe(200);
    expect(
      (await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } })).emailDigestOptIn,
    ).toBe(false);

    const token = url.searchParams.get('token')!;
    const forged = `${token.split('.')[0]}.${'A'.repeat(43)}`;
    const bad = await request(ctx.app.getHttpServer()).post(
      `/api/v1/email/unsubscribe?token=${forged}`,
    );
    expect(bad.status).toBe(400);
  });
});
