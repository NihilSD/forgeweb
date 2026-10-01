/**
 * Spec L8: verified attempts. Acceptance: two users starting the same template get different
 * instances; replays are only visible to the owner and moderators. Also: consent, limits,
 * follow-ups graded against the user's own code, integrity outcomes, appeals and moderation.
 */
import { resolve } from 'node:path';
import type { AttemptEvent } from '@forge/shared';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AttemptsService } from '../src/attempts/attempts.service.js';
import { totpAt } from '../src/auth/totp.js';
import { EntitlementsService } from '../src/entitlements/entitlements.service.js';
import { importProblems } from '../src/problems/importer.js';
import { RatingsService } from '../src/ratings/ratings.service.js';
import { FakeRunner, waitDone } from './fake-runner.js';
import { createTestContext, createUser, type TestClient, type TestContext } from './helpers.js';

const ROOT = resolve(import.meta.dirname, '../../../content/problems');
const SLUG = 'two-sum-orders';
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
  const q = new Redis(process.env.RUNNER_REDIS_URL!);
  await q.flushdb();
  await q.quit();
  await importProblems(ctx.prisma, ROOT, { publishDrafts: true });
  ctx.app.get(EntitlementsService).planResolver = async () => 'free';
});

async function start(client: TestClient, slug = SLUG) {
  const res = await client.post(`/verified/${slug}/attempts`, {
    consent: true,
    language: 'python',
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as { id: string; starter: string; statement: string };
}

/** Deletes the starter, then types the solution four characters at a time. */
function typing(starter: string, code = SOLUTION): AttemptEvent[] {
  const events: AttemptEvent[] = [
    { type: 'edit', t: 1000, changes: [{ offset: 0, length: starter.length, text: '' }] },
  ];
  for (let i = 0; i < code.length; i += 4) {
    events.push({
      type: 'edit',
      t: 2000 + i * 50,
      changes: [{ offset: i, length: 0, text: code.slice(i, i + 4) }],
    });
  }
  return events;
}

function pasting(starter: string): AttemptEvent[] {
  return [
    { type: 'paste', t: 5000, length: SOLUTION.length, internal: false, hash: 'c'.repeat(64) },
    { type: 'edit', t: 5000, changes: [{ offset: 0, length: starter.length, text: SOLUTION }] },
  ];
}

async function sendEvents(client: TestClient, id: string, events: AttemptEvent[]) {
  for (let seq = 0; seq * 200 < events.length; seq++) {
    const res = await client.post(`/attempts/${id}/events`, {
      seq,
      events: events.slice(seq * 200, (seq + 1) * 200),
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  }
}

async function waitStatus(client: TestClient, id: string, statuses: string[]) {
  const until = Date.now() + 30_000;
  for (;;) {
    const res = await client.get(`/attempts/${id}`);
    if (statuses.includes(res.body.status)) return res.body;
    if (Date.now() > until) throw new Error(`attempt stuck: ${JSON.stringify(res.body.status)}`);
    await new Promise((r) => setTimeout(r, 100));
  }
}

/** Answers every follow-up, correctly (from the server's expected answer) or not. */
async function answerAll(client: TestClient, id: string, correct: boolean) {
  for (let i = 0; i < 5; i++) {
    const next = await client.get(`/attempts/${id}/followup`);
    expect(next.status).toBe(200);
    const q = next.body.question;
    if (!q) return;
    // The question never carries the answer.
    expect(JSON.stringify(q)).not.toMatch(/expected/);
    const row = await ctx.prisma.followUp.findFirstOrThrow({
      where: { attemptId: id, questionId: q.id },
    });
    const e = row.expected as { type: string; value?: unknown; lines?: number[] };
    const answer = !correct
      ? 'I am not sure'
      : e.type === 'lines'
        ? String(e.lines![0])
        : e.type === 'value'
          ? JSON.stringify(e.value)
          : String(e.value);
    const res = await client.post(`/attempts/${id}/followup`, { questionId: q.id, answer });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  }
}

async function solve(client: TestClient, id: string, events: AttemptEvent[], run = true) {
  await sendEvents(client, id, events);
  if (run) {
    const r = await client.post(`/attempts/${id}/run`, { code: SOLUTION });
    expect(r.status).toBe(202);
    await waitDone((p) => client.get(p), r.body.id);
  }
  const s = await client.post(`/attempts/${id}/submit`, { code: SOLUTION });
  expect(s.status, JSON.stringify(s.body)).toBe(202);
  const done = await waitDone((p) => client.get(p), s.body.id);
  expect(done.body.verdict).toBe('accepted');
  // The follow-up probes ride along with the submission but are never shown.
  expect(JSON.stringify(done.body)).not.toMatch(/probes|fu-/);
  return waitStatus(client, id, ['followups']);
}

async function moderator() {
  const m = await createUser(ctx);
  await ctx.prisma.user.update({ where: { id: m.user.id }, data: { role: 'moderator' } });
  const setup = await m.client.post('/auth/2fa/setup');
  await m.client.post('/auth/2fa/enable', { code: totpAt(setup.body.secret, Date.now()) });
  return m;
}

describe('starting an attempt', () => {
  it('gives two users starting the same template different instances', async () => {
    const a = await createUser(ctx);
    const b = await createUser(ctx);
    const ra = await start(a.client);
    const rb = await start(b.client);
    const [rowA, rowB] = await Promise.all([
      ctx.prisma.attempt.findUniqueOrThrow({ where: { id: ra.id } }),
      ctx.prisma.attempt.findUniqueOrThrow({ where: { id: rb.id } }),
    ]);
    expect(rowA.seed).not.toBe(rowB.seed);
    expect(rowA.instanceHash).not.toBe(rowB.instanceHash);
    expect(ra.statement).not.toBe(rb.statement);
    // Nor the user's own Practice instance.
    const practice = await a.client.get(`/problems/${SLUG}`);
    expect(practice.body.statement).not.toBe(ra.statement);
  });

  it('requires consent, a verified email and a verified-enabled problem', async () => {
    const { client } = await createUser(ctx);
    expect(
      (await client.post(`/verified/${SLUG}/attempts`, { consent: false, language: 'python' }))
        .status,
    ).toBe(400);
    expect(
      (
        await client.post('/verified/fix-average-rating/attempts', {
          consent: true,
          language: 'python',
        })
      ).status,
    ).toBe(404);
    expect(
      (await client.post(`/verified/${SLUG}/attempts`, { consent: true, language: 'sql' })).status,
    ).toBe(400);
    const unverified = await createUser(ctx, { verify: false });
    expect(
      (
        await unverified.client.post(`/verified/${SLUG}/attempts`, {
          consent: true,
          language: 'python',
        })
      ).status,
    ).toBe(403);
    expect(
      (await ctx.client().post(`/verified/${SLUG}/attempts`, { consent: true, language: 'python' }))
        .status,
    ).toBe(401);
  });

  it('allows one open attempt at a time', async () => {
    const { client } = await createUser(ctx);
    const first = await start(client);
    const second = await client.post('/verified/fix-restock-report/attempts', {
      consent: true,
      language: 'python',
    });
    expect(second.status).toBe(409);
    expect(second.body.error.details.attemptId).toBe(first.id);
    const list = await client.get('/verified');
    expect(list.body.activeAttemptId).toBe(first.id);
  });

  it('limits Free users to 3 verified starts per week; Pro is unlimited', async () => {
    const { client, user } = await createUser(ctx);
    const close = (id: string) =>
      ctx.prisma.attempt.update({ where: { id }, data: { status: 'expired' } });
    for (let i = 0; i < 3; i++) await close((await start(client)).id);
    expect((await client.get('/verified')).body.remainingThisWeek).toBe(0);
    const blocked = await client.post(`/verified/${SLUG}/attempts`, {
      consent: true,
      language: 'python',
    });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('LIMIT_REACHED');
    // Last week's starts don't count.
    await ctx.prisma.attempt.updateMany({
      where: { userId: user.id },
      data: { startedAt: new Date(Date.now() - 9 * 86_400_000) },
    });
    await close((await start(client)).id);
    ctx.app.get(EntitlementsService).planResolver = async () => 'pro';
    for (let i = 0; i < 3; i++) await close((await start(client)).id);
    expect((await client.get('/verified')).body.remainingThisWeek).toBeNull();
  });
});

describe('during an attempt', () => {
  it('records event batches idempotently and validates them', async () => {
    const { client } = await createUser(ctx);
    const { id, starter } = await start(client);
    const events = typing(starter).slice(0, 5);
    expect((await client.post(`/attempts/${id}/events`, { seq: 0, events })).body.stored).toBe(
      true,
    );
    expect((await client.post(`/attempts/${id}/events`, { seq: 0, events })).body.stored).toBe(
      false,
    );
    expect(await ctx.prisma.attemptEvent.count({ where: { attemptId: id } })).toBe(1);
    const stored = await ctx.prisma.attemptEvent.findFirstOrThrow({ where: { attemptId: id } });
    // Stored gzip-compressed.
    expect(Buffer.from(stored.payload).subarray(0, 2).toString('hex')).toBe('1f8b');
    expect(
      (
        await client.post(`/attempts/${id}/events`, {
          seq: 1,
          events: [{ type: 'keylogger', t: 1 }],
        })
      ).status,
    ).toBe(400);
    const other = await createUser(ctx);
    expect((await other.client.post(`/attempts/${id}/events`, { seq: 2, events })).status).toBe(
      404,
    );
  });

  it('shows only visible tests and blocks hints and the editorial', async () => {
    const { client } = await createUser(ctx);
    const { id } = await start(client);
    const view = await client.get(`/attempts/${id}`);
    expect(view.body.visibleTests.length).toBeGreaterThan(0);
    expect(JSON.stringify(view.body)).not.toMatch(/hidden|reference|seed/i);
    expect((await client.get(`/problems/${SLUG}/hints`)).status).toBe(409);
    expect((await client.post(`/problems/${SLUG}/hints/1/reveal`)).status).toBe(409);
  });

  it('closes when time is up', async () => {
    const { client } = await createUser(ctx);
    const { id } = await start(client);
    await ctx.prisma.attempt.update({
      where: { id },
      data: { endsAt: new Date(Date.now() - 60_000) },
    });
    const late = await client.post(`/attempts/${id}/submit`, { code: SOLUTION });
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe('ATTEMPT_CLOSED');
    expect((await client.get(`/attempts/${id}`)).body.status).toBe('expired');
  });
});

describe('finishing an attempt', () => {
  it('verifies an honest solve after correct follow-ups', async () => {
    const { client } = await createUser(ctx);
    const { id, starter } = await start(client);
    const followups = await solve(client, id, typing(starter));
    expect(followups.followUps.total).toBeGreaterThanOrEqual(2);
    expect(followups.followUps.total).toBeLessThanOrEqual(3);
    await answerAll(client, id, true);
    const done = await client.get(`/attempts/${id}`);
    expect(done.body.status).toBe('verified');
    expect(done.body.integrityScore).toBeGreaterThanOrEqual(70);
    expect(done.body.followUps.correct).toBe(done.body.followUps.total);
    expect(done.body.canAppeal).toBe(false);
    // The signal breakdown stays with moderators.
    expect(JSON.stringify(done.body)).not.toMatch(/signals/);
    const audit = await ctx.prisma.auditLog.findFirstOrThrow({
      where: { action: 'attempt.finished', target: id },
    });
    expect(JSON.stringify(audit.meta)).not.toContain('def match_orders');
    // V1.1: the verified result reaches the rating queue and counts as a win.
    await ctx.app.get(RatingsService).drain();
    const change = await ctx.prisma.ratingChange.findFirstOrThrow({
      where: { eventKey: `attempt:${id}` },
    });
    expect(change).toMatchObject({ kind: 'verified', score: 1 });
  });

  it('grades follow-ups against the user’s own code and closes late answers', async () => {
    const { client } = await createUser(ctx);
    const { id, starter } = await start(client);
    await solve(client, id, typing(starter));
    const first = (await client.get(`/attempts/${id}/followup`)).body.question;
    await ctx.prisma.followUp.updateMany({
      where: { attemptId: id, questionId: first.id },
      data: { shownAt: new Date(Date.now() - 120_000) },
    });
    const row = await ctx.prisma.followUp.findFirstOrThrow({
      where: { attemptId: id, questionId: first.id },
    });
    const e = row.expected as { type: string; value?: unknown; lines?: number[] };
    const right = e.type === 'lines' ? String(e.lines![0]) : JSON.stringify(e.value ?? '');
    await client.post(`/attempts/${id}/followup`, { questionId: first.id, answer: right });
    const closed = await ctx.prisma.followUp.findFirstOrThrow({ where: { id: row.id } });
    expect(closed.correct).toBe(false);
    // Answering twice is refused.
    expect(
      (await client.post(`/attempts/${id}/followup`, { questionId: first.id, answer: right }))
        .status,
    ).toBe(409);
  });

  it('sends a pasted solve with wrong follow-ups to review, then handles the appeal', async () => {
    const owner = await createUser(ctx);
    const { id, starter } = await start(owner.client);
    await solve(owner.client, id, pasting(starter), false);
    await answerAll(owner.client, id, false);
    const result = await owner.client.get(`/attempts/${id}`);
    expect(result.body.status).toBe('review');
    expect(result.body.canAppeal).toBe(true);

    expect(
      (await owner.client.post(`/attempts/${id}/appeal`, { reason: 'too short' })).status,
    ).toBe(400);
    const appeal = await owner.client.post(`/attempts/${id}/appeal`, {
      reason: 'I wrote this earlier in my own editor and pasted it in. Happy to explain it.',
    });
    expect(appeal.status).toBe(200);
    expect((await owner.client.get(`/attempts/${id}`)).body.status).toBe('appealed');
    expect(
      (
        await owner.client.post(`/attempts/${id}/appeal`, {
          reason: 'A second appeal for the same attempt is not allowed.',
        })
      ).status,
    ).toBe(409);

    const mod = await moderator();
    const queue = await mod.client.get('/admin/attempts/queue');
    expect(queue.status).toBe(200);
    const item = queue.body.items.find((i: { attemptId: string }) => i.attemptId === id);
    expect(item.appealReason).toMatch(/own editor/);
    expect(JSON.stringify(queue.body)).not.toContain(owner.email);

    const replay = await mod.client.get(`/admin/attempts/${id}/replay`);
    expect(replay.status).toBe(200);
    expect(replay.body.signals.map((s: { id: string }) => s.id)).toContain('paste');
    expect(replay.body.events.some((e: { type: string }) => e.type === 'paste')).toBe(true);

    expect(
      (
        await mod.client.post(`/admin/attempts/${id}/decision`, {
          decision: 'verified',
          notes: 'x',
        })
      ).status,
    ).toBe(400);
    const decision = await mod.client.post(`/admin/attempts/${id}/decision`, {
      decision: 'verified',
      notes: 'Explained the solution convincingly in the appeal; replay shows one paste.',
    });
    expect(decision.status).toBe(200);
    expect((await owner.client.get(`/attempts/${id}`)).body).toMatchObject({
      status: 'verified',
      appeal: { status: 'upheld' },
    });
    expect(await ctx.prisma.review.count({ where: { attemptId: id } })).toBe(1);
    expect(
      await ctx.prisma.auditLog.count({
        where: { action: { in: ['attempt.replay_viewed', 'attempt.reviewed'] }, target: id },
      }),
    ).toBe(2);
  });
});

describe('replays', () => {
  it('are only visible to the owner and moderators', async () => {
    const owner = await createUser(ctx);
    const { id, starter } = await start(owner.client);
    await sendEvents(owner.client, id, typing(starter).slice(0, 30));

    const own = await owner.client.get(`/attempts/${id}/replay`);
    expect(own.status).toBe(200);
    expect(own.body.events).toHaveLength(30);
    expect(own.body.signals).toBeNull();

    const stranger = await createUser(ctx);
    expect((await stranger.client.get(`/attempts/${id}/replay`)).status).toBe(404);
    expect((await stranger.client.get(`/attempts/${id}`)).status).toBe(404);
    expect((await stranger.client.get(`/admin/attempts/${id}/replay`)).status).toBe(403);
    expect((await ctx.client().get(`/attempts/${id}/replay`)).status).toBe(401);

    // A moderator without 2FA is refused; with 2FA they can watch it.
    const noTotp = await createUser(ctx);
    await ctx.prisma.user.update({ where: { id: noTotp.user.id }, data: { role: 'moderator' } });
    expect((await noTotp.client.get(`/admin/attempts/${id}/replay`)).status).toBe(403);
    const mod = await moderator();
    expect((await mod.client.get(`/admin/attempts/${id}/replay`)).status).toBe(200);
    // Other admin roles are not moderators.
    const editor = await moderator();
    await ctx.prisma.user.update({
      where: { id: editor.user.id },
      data: { role: 'content_editor' },
    });
    expect((await editor.client.get(`/admin/attempts/${id}/replay`)).status).toBe(403);
  });

  it('are deleted after 12 months unless kept public', async () => {
    const { client } = await createUser(ctx);
    const kept = await start(client);
    await sendEvents(client, kept.id, typing(kept.starter).slice(0, 3));
    const old = new Date(Date.now() - 400 * 86_400_000);
    await ctx.prisma.attempt.update({
      where: { id: kept.id },
      data: { status: 'expired', finishedAt: old },
    });
    const purged = await start(client);
    await sendEvents(client, purged.id, typing(purged.starter).slice(0, 3));
    await ctx.prisma.attempt.update({
      where: { id: purged.id },
      data: { status: 'expired', finishedAt: old },
    });
    await ctx.prisma.attempt.update({ where: { id: kept.id }, data: { replayPublic: true } });

    expect(await ctx.app.get(AttemptsService).purgeExpiredReplays()).toBe(1);
    expect(await ctx.prisma.attemptEvent.count({ where: { attemptId: purged.id } })).toBe(0);
    expect(await ctx.prisma.attemptEvent.count({ where: { attemptId: kept.id } })).toBe(1);
    expect((await client.get(`/attempts/${purged.id}/replay`)).status).toBe(404);
  });
});
