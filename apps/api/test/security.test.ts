import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { totpAt } from '../src/auth/totp.js';
import { createTestContext, createUser, STRONG_PASSWORD, type TestContext } from './helpers.js';

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

describe('CSRF', () => {
  it('rejects a state-changing request without the CSRF header', async () => {
    const { client } = await createUser(ctx);
    const res = await client.post('/me/sessions/revoke-others', {}, { csrf: false });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF_FAILED');
  });

  it('rejects a header that does not match the cookie', async () => {
    const { client } = await createUser(ctx);
    const res = await client.post(
      '/me/sessions/revoke-others',
      {},
      { csrf: false, headers: { 'x-csrf-token': 'forged' } },
    );
    expect(res.body.error.code).toBe('CSRF_FAILED');
  });

  it('rejects an unsigned token even when cookie and header match', async () => {
    const c = ctx.client();
    c.cookies.set('forge_csrf', 'attacker-chosen-value');
    const res = await c.post(
      '/auth/login',
      { email: 'a@example.com', password: 'x' },
      { csrf: false, headers: { 'x-csrf-token': 'attacker-chosen-value' } },
    );
    expect(res.body.error.code).toBe('CSRF_FAILED');
  });

  it('rejects cross-origin requests by Origin header', async () => {
    const { client } = await createUser(ctx);
    const res = await client.post(
      '/me/sessions/revoke-others',
      {},
      { headers: { origin: 'https://evil.example' } },
    );
    expect(res.body.error.code).toBe('CSRF_FAILED');
  });
});

describe('rate limits', () => {
  it('limits login attempts per IP', async () => {
    const c = ctx.client('192.0.2.10');
    let last = 0;
    for (let i = 0; i < 11; i++) {
      last = (await c.post('/auth/login', { email: `x${i}@example.com`, password: 'whatever-123' }))
        .status;
    }
    expect(last).toBe(429);
  });

  it('limits sign-ups per IP', async () => {
    const c = ctx.client('192.0.2.11');
    let last = 0;
    for (let i = 0; i < 11; i++) {
      last = (
        await c.post('/auth/signup', {
          email: `s${i}@example.com`,
          password: STRONG_PASSWORD,
          acceptTerms: true,
        })
      ).status;
    }
    expect(last).toBe(429);
  });

  it('limits password reset requests per account', async () => {
    const { email } = await createUser(ctx);
    let last = 0;
    for (let i = 0; i < 6; i++) {
      last = (await ctx.client(`198.51.100.${i}`).post('/auth/password/forgot', { email })).status;
    }
    expect(last).toBe(429);
  });

  it('returns the standard error shape and Retry-After', async () => {
    const c = ctx.client('192.0.2.12');
    let res;
    for (let i = 0; i < 11; i++)
      res = await c.post('/auth/login', { email: 'a@example.com', password: 'whatever-123' });
    expect(res!.body.error.code).toBe('RATE_LIMITED');
    expect(Number(res!.headers['retry-after'])).toBeGreaterThan(0);
  });
});

describe('authorization', () => {
  it('rejects anonymous access to account endpoints', async () => {
    const res = await ctx.client().get('/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('forbids admin endpoints to regular users', async () => {
    const { client } = await createUser(ctx);
    expect((await client.get('/admin/audit-log')).status).toBe(403);
  });

  it('requires 2FA for admins', async () => {
    const { client, user } = await createUser(ctx);
    await ctx.prisma.user.update({ where: { id: user.id }, data: { role: 'superadmin' } });
    const no2fa = await client.get('/admin/audit-log');
    expect(no2fa.status).toBe(403);
    expect(no2fa.body.error.code).toBe('TWO_FACTOR_REQUIRED');

    const setup = await client.post('/auth/2fa/setup');
    await client.post('/auth/2fa/enable', { code: totpAt(setup.body.secret, Date.now()) });
    const ok = await client.get('/admin/audit-log');
    expect(ok.status).toBe(200);
    expect(ok.body.items.some((e: { action: string }) => e.action === '2fa.enabled')).toBe(true);
  });

  it('audit-logs role changes by a superadmin', async () => {
    const admin = await createUser(ctx);
    const target = await createUser(ctx);
    await ctx.prisma.user.update({ where: { id: admin.user.id }, data: { role: 'superadmin' } });
    const setup = await admin.client.post('/auth/2fa/setup');
    await admin.client.post('/auth/2fa/enable', { code: totpAt(setup.body.secret, Date.now()) });
    const res = await admin.client.patch(`/admin/users/${target.user.id}/role`, {
      role: 'moderator',
    });
    expect(res.status).toBe(200);
    const log = await ctx.prisma.auditLog.findFirst({
      where: { action: 'user.role_changed', target: target.user.id },
    });
    expect(log?.actorId).toBe(admin.user.id);
  });
});

describe('OAuth', () => {
  it('starts with PKCE (S256) and a state parameter', async () => {
    const { OAuthService } = await import('../src/auth/oauth.service.js');
    ctx.app
      .get(OAuthService)
      .setProviderConfig('github', { clientId: 'cid', clientSecret: 'secret' });
    const res = await ctx.client().get('/auth/oauth/github/start');
    expect(res.status).toBe(302);
    const url = new URL(res.headers.location!);
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(url.searchParams.get('state')).toMatch(/^[A-Za-z0-9_-]{20,}$/);
  });

  async function mockedFlow(profile: { id: string; email: string; verified: boolean }) {
    const { OAuthService } = await import('../src/auth/oauth.service.js');
    const svc = ctx.app.get(OAuthService);
    svc.setProviderConfig('github', { clientId: 'cid', clientSecret: 'secret' });
    svc.fetchProfileOverride = async () => profile;
    const c = ctx.client();
    const start = await c.get('/auth/oauth/github/start');
    const state = new URL(start.headers.location!).searchParams.get('state')!;
    const cb = await c.get(`/auth/oauth/github/callback?code=abc&state=${state}`);
    return { c, cb };
  }

  it('creates an account from a verified provider email', async () => {
    const { c, cb } = await mockedFlow({ id: 'gh-1', email: 'oauth@example.com', verified: true });
    expect(cb.status).toBe(302);
    expect(cb.headers.location).toMatch(/\/onboarding$/);
    const me = await c.get('/me');
    expect(me.body.email).toBe('oauth@example.com');
    expect(me.body.emailVerified).toBe(true);
  });

  it('rejects a callback whose state does not match', async () => {
    const { OAuthService } = await import('../src/auth/oauth.service.js');
    ctx.app
      .get(OAuthService)
      .setProviderConfig('github', { clientId: 'cid', clientSecret: 'secret' });
    const c = ctx.client();
    await c.get('/auth/oauth/github/start');
    const cb = await c.get('/auth/oauth/github/callback?code=abc&state=forged-state-value-000000');
    expect(cb.status).toBe(302);
    expect(cb.headers.location).toMatch(/error=oauth_state/);
    expect((await c.get('/me')).status).toBe(401);
  });

  it('links to an existing account only when the provider email is verified', async () => {
    await createUser(ctx, { email: 'both@example.com' });
    const unverified = await mockedFlow({ id: 'gh-2', email: 'both@example.com', verified: false });
    expect(unverified.cb.headers.location).toMatch(/error=oauth_unverified_email/);
    expect(await ctx.prisma.oAuthAccount.count()).toBe(0);

    const verified = await mockedFlow({ id: 'gh-2', email: 'both@example.com', verified: true });
    expect(verified.cb.headers.location).not.toMatch(/error/);
    expect(await ctx.prisma.oAuthAccount.count()).toBe(1);
  });
});
