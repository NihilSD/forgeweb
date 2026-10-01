/**
 * Phase L12: a hostile pass over the whole API. Routes are discovered from Nest's own metadata, so
 * a new endpoint is covered (and must be deliberately public) without editing this file.
 */
import { resolve } from 'node:path';
import { RequestMethod } from '@nestjs/common';
import { ModulesContainer, Reflector } from '@nestjs/core';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { testSignature } from '../src/billing/stripe-client.js';
import { IS_PUBLIC } from '../src/common/request-context.js';
import { importProblems } from '../src/problems/importer.js';
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
});

interface Route {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  path: string;
  isPublic: boolean;
  roles: string[] | undefined;
}

function discoverRoutes(): Route[] {
  const reflector = new Reflector();
  const routes: Route[] = [];
  for (const mod of ctx.app.get(ModulesContainer).values()) {
    for (const wrapper of mod.controllers.values()) {
      const cls = wrapper.metatype as (new (...a: never[]) => unknown) | null;
      if (!cls) continue;
      const base = String(Reflect.getMetadata('path', cls) ?? '');
      for (const name of Object.getOwnPropertyNames(cls.prototype)) {
        const handler = (cls.prototype as Record<string, unknown>)[name];
        if (name === 'constructor' || typeof handler !== 'function') continue;
        const sub = Reflect.getMetadata('path', handler) as string | undefined;
        if (sub === undefined) continue;
        const method = RequestMethod[Reflect.getMetadata('method', handler) as number];
        const path = `/${[base, sub]
          .map((p) => p.replace(/^\/|\/$/g, ''))
          .filter(Boolean)
          .join('/')}`;
        routes.push({
          method: method!.toLowerCase() as Route['method'],
          path,
          isPublic: Boolean(reflector.getAllAndOverride(IS_PUBLIC, [handler, cls])),
          roles: reflector.getAllAndOverride('forge:roles', [handler, cls]),
        });
      }
    }
  }
  return routes;
}

const PARAMS: Record<string, string> = {
  id: '00000000-0000-4000-8000-000000000000',
  slug: 'two-sum-orders',
  level: '1',
  lesson: 'lists',
  language: 'python',
  name: 'intercept.txt',
  provider: 'github',
  sessionId: '00000000-0000-4000-8000-000000000000',
  userId: '00000000-0000-4000-8000-000000000000',
};
const fill = (path: string) => path.replace(/:(\w+)/g, (_, p: string) => PARAMS[p] ?? 'x');

/**
 * Routes that are public on purpose. Adding a public route must update this list (reviewed).
 */
const PUBLIC_ALLOWLIST = new Set([
  'get /health',
  'get /auth/csrf',
  'post /auth/signup',
  'post /auth/login',
  // Logging out without a session is a harmless no-op.
  'post /auth/logout',
  'post /auth/verify-email',
  'post /auth/password/forgot',
  'post /auth/password/reset',
  'get /auth/oauth/providers',
  'get /auth/oauth/:provider/start',
  'get /auth/oauth/:provider/callback',
  'get /problems',
  'get /problems/:slug',
  'get /tracks',
  'get /courses',
  'get /courses/:slug',
  'get /courses/:slug/lessons/:lesson',
  'get /daily',
  'get /billing/prices',
  'post /billing/webhook',
  'post /email/unsubscribe',
  'post /internal/runner/callback',
  'get /status',
  'get /internal/metrics', // Bearer METRICS_TOKEN, checked in the handler
]);

describe('every route', () => {
  it('is either on the public allowlist or requires a session', async () => {
    const routes = discoverRoutes();
    expect(routes.length).toBeGreaterThan(60);
    const publicRoutes = routes.filter((r) => r.isPublic).map((r) => `${r.method} ${r.path}`);
    expect(publicRoutes.filter((r) => !PUBLIC_ALLOWLIST.has(r))).toEqual([]);

    const leaks: string[] = [];
    // A fresh IP per probe, so the anonymous rate limit (which runs first) doesn't mask the answer.
    for (const [i, r] of routes.filter((x) => !x.isPublic).entries()) {
      const anon = ctx.client(`198.18.${Math.floor(i / 250)}.${i % 250}`);
      const res = await anon.req(r.method, fill(r.path), r.method === 'get' ? undefined : {});
      if (res.status !== 401) leaks.push(`${r.method} ${r.path} → ${res.status}`);
      else expect(res.body.error.code).toMatch(/UNAUTHENTICATED/);
    }
    expect(leaks).toEqual([]);
  });

  it('restricts every admin route to admin roles', async () => {
    const admin = discoverRoutes().filter((r) => r.roles);
    expect(admin.length).toBeGreaterThan(5);
    expect(admin.every((r) => r.path.startsWith('/admin'))).toBe(true);
    const { client } = await createUser(ctx);
    const leaks: string[] = [];
    for (const r of admin) {
      const res = await client.req(r.method, fill(r.path), r.method === 'get' ? undefined : {});
      if (res.status !== 403) leaks.push(`${r.method} ${r.path} → ${res.status}`);
    }
    expect(leaks).toEqual([]);
  });

  it('never answers with the stack or internals on bad input', async () => {
    const { client } = await createUser(ctx);
    const routes = discoverRoutes().filter((r) => !r.isPublic && !r.roles && r.method !== 'get');
    for (const r of routes) {
      const res = await client.req(r.method, fill(r.path), {
        __proto__: { polluted: true },
        x: 'y'.repeat(50),
      });
      // 503 is the deliberate "payments not configured" answer, never a crash.
      if (res.status === 503) expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
      else expect(res.status, `${r.method} ${r.path}`).toBeLessThan(500);
      expect(JSON.stringify(res.body)).not.toMatch(/at \w+ \(|node_modules|prisma|stack/i);
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe('IDOR: one user cannot reach another user’s resources', () => {
  beforeEach(async () => {
    await importProblems(ctx.prisma, ROOT, { publishDrafts: true });
  });

  it('submissions and verified attempts', async () => {
    const a = await createUser(ctx);
    const b = await createUser(ctx);
    const p = await ctx.prisma.problem.findUniqueOrThrow({ where: { slug: 'two-sum-orders' } });
    const sub = await ctx.prisma.submission.create({
      data: {
        userId: a.user.id,
        problemId: p.id,
        version: p.version,
        language: 'python',
        code: 'secret code',
        kind: 'submit',
        seed: 1,
      },
    });
    const attempt = await a.client.post('/verified/two-sum-orders/attempts', {
      consent: true,
      language: 'python',
    });
    expect(attempt.status).toBe(201);
    const id = attempt.body.id as string;
    const probes: [string, string, unknown?][] = [
      ['get', `/submissions/${sub.id}`],
      ['get', `/attempts/${id}`],
      ['get', `/attempts/${id}/replay`],
      ['get', `/attempts/${id}/followup`],
      ['post', `/attempts/${id}/events`, { seq: 0, events: [] }],
      ['post', `/attempts/${id}/run`, { code: 'print(1)' }],
      ['post', `/attempts/${id}/submit`, { code: 'print(1)' }],
      ['post', `/attempts/${id}/followup`, { questionId: 'x', answer: 'y' }],
      ['post', `/attempts/${id}/appeal`, { reason: 'a reason that is long enough to be valid' }],
    ];
    for (const [method, path, body] of probes) {
      const res = await b.client.req(method as 'get', path, body);
      expect(res.status, `${method} ${path}`).toBe(404);
      expect(JSON.stringify(res.body)).not.toContain('secret code');
    }
    // B's list views never include A's rows.
    expect((await b.client.get('/attempts')).body.items).toEqual([]);
    expect((await b.client.get('/problems/two-sum-orders/submissions')).body.items).toEqual([]);
  });

  it('notes, bookmarks, drafts and progress are scoped to the caller', async () => {
    const a = await createUser(ctx);
    const b = await createUser(ctx);
    await a.client.req('put', '/problems/two-sum-orders/note', { text: 'my private note' });
    await a.client.req('put', '/problems/two-sum-orders/drafts/python', { code: 'my draft' });
    await a.client.req('put', '/problems/two-sum-orders/bookmark', {});
    const views = await Promise.all([
      b.client.get('/problems/two-sum-orders/progress'),
      b.client.get('/problems/two-sum-orders/drafts'),
      b.client.get('/me/bookmarks'),
      b.client.get('/me/progress'),
      b.client.get('/billing/status'),
    ]);
    for (const v of views) {
      expect(JSON.stringify(v.body)).not.toMatch(/my private note|my draft/);
    }
    expect(views[2]!.body.items).toEqual([]);
  });
});

describe('oversized and malformed payloads', () => {
  it('rejects bodies over the JSON limit with 413', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('content-type', 'application/json')
      .send(JSON.stringify({ email: 'a@b.co', password: 'x'.repeat(300_000) }));
    expect(res.status).toBe(413);
    expect(res.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('rejects malformed JSON with a clean 400', async () => {
    const res = await request(ctx.app.getHttpServer())
      .post('/api/v1/auth/login')
      .set('content-type', 'application/json')
      .send('{"email": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBeDefined();
  });

  it('caps code size, event batches and webhook bodies', async () => {
    await importProblems(ctx.prisma, ROOT, { publishDrafts: true });
    const { client } = await createUser(ctx);
    const big = await client.post('/problems/two-sum-orders/run', {
      language: 'python',
      code: `# ${'x'.repeat(70 * 1024)}`,
    });
    expect(big.status).toBe(400);
    const attempt = await client.post('/verified/two-sum-orders/attempts', {
      consent: true,
      language: 'python',
    });
    const events = Array.from({ length: 1001 }, (_, t) => ({ type: 'focus', t }));
    expect(
      (await client.post(`/attempts/${attempt.body.id}/events`, { seq: 0, events })).status,
    ).toBe(400);
    const hugeWebhook = await request(ctx.app.getHttpServer())
      .post('/api/v1/billing/webhook')
      .set('content-type', 'application/json')
      .set('stripe-signature', 't=1,v1=x')
      .send(JSON.stringify({ pad: 'x'.repeat(1_100_000) }));
    expect(hugeWebhook.status).toBe(413);
  });
});

describe('replays and spoofing', () => {
  it('rejects a correctly signed Stripe webhook that is too old to be fresh', async () => {
    const payload = JSON.stringify({
      id: 'evt_old',
      object: 'event',
      type: 'invoice.paid',
      created: 1,
      data: { object: {} },
    });
    const signature = testSignature(payload, process.env.STRIPE_WEBHOOK_SECRET!);
    const old = signature.replace(/t=\d+/, `t=${Math.floor(Date.now() / 1000) - 3600}`);
    const res = await request(ctx.app.getHttpServer())
      .post('/api/v1/billing/webhook')
      .set('content-type', 'application/json')
      .set('stripe-signature', old)
      .send(payload);
    expect(res.status).toBe(401);
    expect(await ctx.prisma.webhookEvent.count()).toBe(0);
  });

  it('ignores X-Forwarded-For when choosing the rate-limit key (no proxy trusted)', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 25; i++) {
      const res = await request(ctx.app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('x-forwarded-for', `203.0.113.${i}`)
        .send({ email: 'nobody@example.com', password: 'wrong-password-123' });
      statuses.push(res.status);
    }
    expect(statuses).toContain(429);
  });

  it('with 2 trusted hops (Caddy + Next.js) uses the address Caddy saw, not a spoofed one', async () => {
    // Production chain: client → Caddy (replaces XFF with the peer address) → Next.js rewrite
    // (appends Caddy's address) → API. A client-sent XFF never survives Caddy, but even if a
    // proxy appended instead of replacing, the spoofed entry would sit left of the trusted hops.
    const app = express();
    app.set('trust proxy', 2);
    app.get('/', (req, res) => res.send(req.ip));
    const res = await request(app)
      .get('/')
      .set('x-forwarded-for', '6.6.6.6, 198.51.100.7, 172.18.0.5');
    expect(res.text).toBe('198.51.100.7');
  });

  it('sets the security headers on API responses', async () => {
    const res = await request(ctx.app.getHttpServer()).get('/api/v1/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBeDefined();
    expect(res.headers['permissions-policy']).toBeDefined();
    expect(res.headers['x-powered-by']).toBeUndefined();
  });
});
