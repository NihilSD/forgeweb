import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { totpAt } from '../src/auth/totp.js';
import {
  createTestContext,
  createUser,
  extractToken,
  STRONG_PASSWORD,
  type TestContext,
} from './helpers.js';

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

describe('sign-up', () => {
  it('creates an account, a secure session cookie and sends a verification email', async () => {
    const c = ctx.client();
    const res = await c.post('/auth/signup', {
      email: 'Ana@Example.com',
      password: STRONG_PASSWORD,
      acceptTerms: true,
    });
    expect(res.status).toBe(201);
    expect(res.body.me.email).toBe('ana@example.com');
    expect(res.body.me.emailVerified).toBe(false);
    const setCookie = (res.headers['set-cookie'] as unknown as string[]).find((s) =>
      s.startsWith('forge_session='),
    )!;
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Secure/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    expect(ctx.emails.lastTo('ana@example.com')?.subject).toMatch(/verify/i);
    const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email: 'ana@example.com' } });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('rejects short passwords with a validation error', async () => {
    const res = await ctx
      .client()
      .post('/auth/signup', { email: 'a@example.com', password: 'short', acceptTerms: true });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects known breached passwords', async () => {
    const res = await ctx.client().post('/auth/signup', {
      email: 'a@example.com',
      password: 'password123456',
      acceptTerms: true,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('WEAK_PASSWORD');
  });

  it('rejects a duplicate email', async () => {
    await createUser(ctx, { email: 'dup@example.com' });
    const res = await ctx.client().post('/auth/signup', {
      email: 'dup@example.com',
      password: STRONG_PASSWORD,
      acceptTerms: true,
    });
    expect(res.status).toBe(409);
  });

  it('requires accepting the terms', async () => {
    const res = await ctx
      .client()
      .post('/auth/signup', { email: 'a@example.com', password: STRONG_PASSWORD });
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});

describe('email verification', () => {
  it('verifies with the emailed token, once', async () => {
    const { client, email } = await createUser(ctx, { verify: false, onboard: false });
    const token = extractToken(ctx.emails.lastTo(email)!.text, 'verify-email');
    const ok = await client.post('/auth/verify-email', { token });
    expect(ok.status).toBe(200);
    expect((await client.get('/me')).body.emailVerified).toBe(true);
    const again = await client.post('/auth/verify-email', { token });
    expect(again.body.error.code).toBe('TOKEN_INVALID');
  });

  it('rejects an expired token', async () => {
    const { client, email } = await createUser(ctx, { verify: false, onboard: false });
    const token = extractToken(ctx.emails.lastTo(email)!.text, 'verify-email');
    await ctx.prisma.emailToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await client.post('/auth/verify-email', { token });
    expect(res.body.error.code).toBe('TOKEN_INVALID');
  });
});

describe('login and lockout', () => {
  it('logs in with the right password and rotates the session', async () => {
    const { email, client: first } = await createUser(ctx);
    const before = first.cookies.get('forge_session');
    const c = ctx.client();
    const res = await c.post('/auth/login', { email, password: STRONG_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(c.cookies.get('forge_session')).toBeDefined();
    expect(c.cookies.get('forge_session')).not.toBe(before);
  });

  it('gives the same error for a wrong password and an unknown email', async () => {
    const { email } = await createUser(ctx);
    const wrong = await ctx.client().post('/auth/login', { email, password: 'wrong-password-123' });
    const unknown = await ctx
      .client()
      .post('/auth/login', { email: 'nobody@example.com', password: 'wrong-password-123' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  it('locks the account after repeated failures, even for the right password', async () => {
    const { email } = await createUser(ctx);
    for (let i = 0; i < 5; i++) {
      await ctx
        .client(`10.0.0.${i}`)
        .post('/auth/login', { email, password: 'wrong-password-123' });
    }
    const res = await ctx
      .client('10.0.1.1')
      .post('/auth/login', { email, password: STRONG_PASSWORD });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('ACCOUNT_LOCKED');
  });

  it('logs out and invalidates the session', async () => {
    const { client } = await createUser(ctx);
    const cookie = client.cookies.get('forge_session');
    await client.post('/auth/logout');
    const stale = ctx.client();
    stale.cookies.set('forge_session', cookie!);
    expect((await stale.get('/me')).status).toBe(401);
  });
});

describe('password reset', () => {
  it('resets with the emailed token and revokes all sessions', async () => {
    const { email, client } = await createUser(ctx);
    const anon = ctx.client();
    expect((await anon.post('/auth/password/forgot', { email })).status).toBe(200);
    const token = extractToken(ctx.emails.lastTo(email)!.text, 'reset-password');
    const res = await anon.post('/auth/password/reset', {
      token,
      password: 'a-brand-new-password-9',
    });
    expect(res.status).toBe(200);
    expect((await client.get('/me')).status).toBe(401);
    const login = await ctx
      .client()
      .post('/auth/login', { email, password: 'a-brand-new-password-9' });
    expect(login.status).toBe(200);
    const reuse = await anon.post('/auth/password/reset', {
      token,
      password: 'another-new-password-9',
    });
    expect(reuse.body.error.code).toBe('TOKEN_INVALID');
  });

  it('does not reveal whether an email exists', async () => {
    const res = await ctx.client().post('/auth/password/forgot', { email: 'nobody@example.com' });
    expect(res.status).toBe(200);
    expect(ctx.emails.outbox).toHaveLength(0);
  });
});

describe('two-factor authentication', () => {
  async function enable2fa(client: ReturnType<TestContext['client']>) {
    const setup = await client.post('/auth/2fa/setup');
    expect(setup.status).toBe(200);
    const secret = setup.body.secret as string;
    const enabledAt = Date.now();
    const usedCode = totpAt(secret, enabledAt);
    const enable = await client.post('/auth/2fa/enable', { code: usedCode });
    expect(enable.status).toBe(200);
    expect(enable.body.recoveryCodes).toHaveLength(10);
    return { secret, usedCode, enabledAt, recoveryCodes: enable.body.recoveryCodes as string[] };
  }

  it('requires the TOTP step after the password and rejects replayed codes', async () => {
    const { client, email } = await createUser(ctx);
    const { secret, usedCode, enabledAt } = await enable2fa(client);

    const c = ctx.client();
    const login = await c.post('/auth/login', { email, password: STRONG_PASSWORD });
    expect(login.body.status).toBe('two_factor_required');
    const blocked = await c.get('/me');
    expect(blocked.status).toBe(401);
    expect(blocked.body.error.code).toBe('TWO_FACTOR_REQUIRED');

    const bad = await c.post('/auth/2fa/verify', { code: '000000' });
    expect(bad.body.error.code).toBe('TWO_FACTOR_INVALID');

    // The code used to enable 2FA must never work again.
    const replay = await c.post('/auth/2fa/verify', { code: usedCode });
    expect(replay.body.error.code).toBe('TWO_FACTOR_INVALID');

    const next = totpAt(secret, enabledAt + 30_000);
    const ok = await c.post('/auth/2fa/verify', { code: next });
    expect(ok.status).toBe(200);
    expect((await c.get('/me')).status).toBe(200);
  });

  it('accepts a recovery code exactly once', async () => {
    const { client, email } = await createUser(ctx);
    const { recoveryCodes } = await enable2fa(client);
    const c = ctx.client();
    await c.post('/auth/login', { email, password: STRONG_PASSWORD });
    expect((await c.post('/auth/2fa/verify', { recoveryCode: recoveryCodes[0] })).status).toBe(200);
    const d = ctx.client();
    await d.post('/auth/login', { email, password: STRONG_PASSWORD });
    const again = await d.post('/auth/2fa/verify', { recoveryCode: recoveryCodes[0] });
    expect(again.body.error.code).toBe('TWO_FACTOR_INVALID');
  });

  it('stores the TOTP secret encrypted', async () => {
    const { client, user } = await createUser(ctx);
    const { secret } = await enable2fa(client);
    const row = await ctx.prisma.totpSecret.findUniqueOrThrow({ where: { userId: user.id } });
    expect(row.encryptedSecret).not.toContain(secret);
  });
});

describe('sessions', () => {
  it('lists sessions and revokes another device', async () => {
    const { client, email } = await createUser(ctx);
    const other = ctx.client();
    await other.post('/auth/login', { email, password: STRONG_PASSWORD });
    const list = await client.get('/me/sessions');
    expect(list.body.items).toHaveLength(2);
    const target = list.body.items.find((s: { current: boolean }) => !s.current);
    expect((await client.delete(`/me/sessions/${target.id}`)).status).toBe(200);
    expect((await other.get('/me')).status).toBe(401);
    expect((await client.get('/me')).status).toBe(200);
  });

  it("cannot revoke another user's session", async () => {
    const a = await createUser(ctx);
    const b = await createUser(ctx);
    const bSession = await ctx.prisma.session.findFirstOrThrow({ where: { userId: b.user.id } });
    const res = await a.client.delete(`/me/sessions/${bSession.id}`);
    expect(res.status).toBe(404);
    expect((await b.client.get('/me')).status).toBe(200);
  });
});

describe('onboarding', () => {
  it('blocks users under 16', async () => {
    const { client } = await createUser(ctx, { onboard: false });
    const year = new Date().getUTCFullYear();
    const res = await client.post('/me/onboarding', {
      handle: 'young',
      displayName: 'Young',
      timeZone: 'UTC',
      birthYear: year - 14,
      goal: 'learn',
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AGE_RESTRICTED');
    const me = await client.get('/me');
    expect(me.body.onboarded).toBe(false);
  });

  it('marks 16-17 year olds as minors', async () => {
    const { client } = await createUser(ctx, { onboard: false });
    const res = await client.post('/me/onboarding', {
      handle: 'teen',
      displayName: 'Teen',
      timeZone: 'UTC',
      birthYear: new Date().getUTCFullYear() - 17,
      goal: 'learn',
    });
    expect(res.status).toBe(200);
    expect(res.body.isMinor).toBe(true);
  });

  it('rejects a taken handle', async () => {
    await createUser(ctx, { handle: 'taken' });
    const { client } = await createUser(ctx, { onboard: false });
    const res = await client.post('/me/onboarding', {
      handle: 'Taken',
      displayName: 'X',
      timeZone: 'UTC',
      birthYear: 1990,
      goal: 'learn',
    });
    expect(res.status).toBe(409);
  });
});

describe('data export and deletion', () => {
  it('exports account data without secrets', async () => {
    const { client, email } = await createUser(ctx);
    const res = await client.get('/me/export');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    const text = JSON.stringify(res.body);
    expect(text).toContain(email);
    expect(text).not.toMatch(/argon2|passwordHash|tokenHash|encryptedSecret/);
    // Every kind of user data has a section.
    for (const section of [
      'submissions',
      'drafts',
      'notes',
      'bookmarks',
      'hints',
      'mastery',
      'problemProgress',
      'reviewQueue',
      'lessons',
      'flagSubmissions',
      'verifiedAttempts',
      'xp',
      'streak',
      'placement',
      'billing',
    ])
      expect(res.body, section).toHaveProperty(section);
  });

  it('schedules deletion, signs out everywhere and purges after 30 days', async () => {
    const { client, email, user } = await createUser(ctx);
    const res = await client.post('/me/delete', { password: STRONG_PASSWORD, confirm: 'DELETE' });
    expect(res.status).toBe(200);
    expect((await client.get('/me')).status).toBe(401);

    const { AccountDeletionService } = await import('../src/users/account-deletion.service.js');
    const svc = ctx.app.get(AccountDeletionService);
    expect(await svc.purgeDue(new Date())).toBe(0);
    expect(await svc.purgeDue(new Date(Date.now() + 31 * 86_400_000))).toBe(1);
    const row = await ctx.prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.deletedAt).not.toBeNull();
    expect(row.email).not.toBe(email);
    expect(row.passwordHash).toBeNull();
    const login = await ctx.client().post('/auth/login', { email, password: STRONG_PASSWORD });
    expect(login.status).toBe(401);
  });

  it("purges every table that holds the user's data (GDPR erasure)", async () => {
    const { importProblems } = await import('../src/problems/importer.js');
    await importProblems(ctx.prisma, resolve(import.meta.dirname, '../../../content/problems'), {
      publishDrafts: true,
    });
    const { client, user } = await createUser(ctx);
    const p = await ctx.prisma.problem.findUniqueOrThrow({ where: { slug: 'two-sum-orders' } });
    const userId = user.id;
    const problemId = p.id;
    await client.req('put', '/problems/two-sum-orders/drafts/python', { code: 'my code' });
    await client.req('put', '/problems/two-sum-orders/note', { text: 'my note' });
    await client.req('put', '/problems/two-sum-orders/bookmark', {});
    await client.post('/problems/two-sum-orders/hints/1/reveal');
    const db = ctx.prisma;
    await db.submission.create({
      data: {
        userId,
        problemId,
        version: 1,
        language: 'python',
        code: 'x',
        kind: 'submit',
        seed: 1,
      },
    });
    const attempt = await db.attempt.create({
      data: {
        userId,
        problemId,
        version: 1,
        language: 'python',
        seed: 1,
        instanceHash: 'h',
        consentAt: new Date(),
        startedAt: new Date(),
        endsAt: new Date(),
      },
    });
    await db.attemptEvent.create({
      data: {
        attemptId: attempt.id,
        seq: 0,
        source: 'client',
        t: 0,
        type: 'batch',
        count: 1,
        payload: Buffer.from('x'),
      },
    });
    await db.problemProgress.create({ data: { userId, problemId } });
    await db.mastery.create({ data: { userId, tag: 'arrays', points: 20, level: 1 } });
    await db.reviewItem.create({ data: { userId, problemId, dueAt: new Date() } });
    await db.flagIssue.create({ data: { userId, problemId, flagHash: `h-${userId}` } });
    await db.flagSubmission.create({ data: { userId, problemId, valueHash: 'v', correct: false } });
    await db.xpEvent.create({
      data: { userId, amount: 5, reason: 'lesson', sourceKey: 'k', at: new Date() },
    });
    await db.streak.create({ data: { userId, current: 1, longest: 1 } });
    await db.placementResult.create({ data: { userId, skipped: true } });
    await db.billingCustomer.create({ data: { userId, stripeCustomerId: `cus_${userId}` } });
    await db.subscription.create({
      data: { userId, stripeSubscriptionId: `sub_${userId}`, status: 'canceled' },
    });
    await db.entitlement.create({ data: { userId, plan: 'free' } });

    await client.post('/me/delete', { password: STRONG_PASSWORD, confirm: 'DELETE' });
    const { AccountDeletionService } = await import('../src/users/account-deletion.service.js');
    await ctx.app.get(AccountDeletionService).purgeDue(new Date(Date.now() + 31 * 86_400_000));

    // Every table with a userId column, found from the schema itself, so new tables are covered.
    const tables = await db.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.columns
      WHERE table_schema = 'public' AND column_name = 'userId'`;
    expect(tables.length).toBeGreaterThan(15);
    const left: string[] = [];
    for (const { table_name } of tables) {
      const [row] = await db.$queryRawUnsafe<{ n: bigint }[]>(
        `SELECT count(*) AS n FROM "${table_name}" WHERE "userId" = $1::uuid`,
        userId,
      );
      if (Number(row!.n) > 0) left.push(table_name);
    }
    expect(left).toEqual([]);
    expect(await db.attemptEvent.count({ where: { attemptId: attempt.id } })).toBe(0);
  });

  it('lets a user cancel a scheduled deletion by signing in', async () => {
    const { client, email } = await createUser(ctx);
    await client.post('/me/delete', { password: STRONG_PASSWORD, confirm: 'DELETE' });
    const c = ctx.client();
    await c.post('/auth/login', { email, password: STRONG_PASSWORD });
    const me = await c.get('/me');
    expect(me.body.deletionScheduledFor).not.toBeNull();
    expect((await c.post('/me/delete/cancel')).status).toBe(200);
    expect((await c.get('/me')).body.deletionScheduledFor).toBeNull();
  });
});
