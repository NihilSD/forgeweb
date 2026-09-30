import { type INestApplication } from '@nestjs/common';
import type { PrismaClient } from '@forge/db';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { EmailService } from '../src/email/email.service.js';
import { PrismaService } from '../src/infra/prisma.service.js';
import { RedisService } from '../src/infra/redis.service.js';

export interface TestContext {
  app: INestApplication;
  prisma: PrismaClient;
  emails: EmailService;
  client: (ip?: string) => TestClient;
  reset: () => Promise<void>;
  close: () => Promise<void>;
}

export async function createTestContext(): Promise<TestContext> {
  const app = await createApp({ logger: false });
  await app.init();
  const prisma = app.get(PrismaService).client;
  const redis = app.get(RedisService).client;
  const emails = app.get(EmailService);
  return {
    app,
    prisma,
    emails,
    client: (ip) => new TestClient(app, ip),
    reset: async () => {
      await truncateAll(prisma);
      await redis.flushdb();
      emails.outbox.length = 0;
    },
    close: () => app.close(),
  };
}

export async function truncateAll(prisma: PrismaClient) {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (rows.length === 0) return;
  const list = rows.map((r) => `"public"."${r.tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}

type Method = 'get' | 'post' | 'patch' | 'put' | 'delete';

/**
 * A browser-like client: keeps cookies (including Secure ones, which superagent would drop over
 * plain http) and sends the CSRF header on state-changing requests.
 */
export class TestClient {
  cookies = new Map<string, string>();
  constructor(
    private readonly app: INestApplication,
    private readonly ip?: string,
  ) {}

  get csrf() {
    return this.cookies.get('forge_csrf');
  }

  private cookieHeader() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  private store(res: request.Response) {
    const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
    for (const c of raw ?? []) {
      const [pair, ...attrs] = c.split(';');
      const idx = pair!.indexOf('=');
      const name = pair!.slice(0, idx).trim();
      const value = pair!.slice(idx + 1).trim();
      const expired = attrs.some(
        (a) => /max-age=0/i.test(a) || /expires=thu, 01 jan 1970/i.test(a),
      );
      if (expired || value === '') this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }

  async ensureCsrf() {
    if (!this.csrf) await this.req('get', '/auth/csrf');
  }

  async req(
    method: Method,
    path: string,
    body?: unknown,
    opts: { csrf?: boolean; headers?: Record<string, string> } = {},
  ) {
    const needsCsrf = method !== 'get' && opts.csrf !== false;
    if (needsCsrf) await this.ensureCsrf();
    let r = request(this.app.getHttpServer())[method](`/api/v1${path}`);
    const cookie = this.cookieHeader();
    if (cookie) r = r.set('cookie', cookie);
    if (this.ip) r = r.set('x-test-ip', this.ip);
    if (needsCsrf && this.csrf) r = r.set('x-csrf-token', this.csrf);
    for (const [k, v] of Object.entries(opts.headers ?? {})) r = r.set(k, v);
    const res = body !== undefined ? await r.send(body as object) : await r;
    this.store(res);
    return res;
  }

  get(path: string, opts?: { headers?: Record<string, string> }) {
    return this.req('get', path, undefined, opts);
  }
  post(path: string, body?: unknown, opts?: { csrf?: boolean; headers?: Record<string, string> }) {
    return this.req('post', path, body ?? {}, opts);
  }
  patch(path: string, body?: unknown) {
    return this.req('patch', path, body ?? {});
  }
  delete(path: string) {
    return this.req('delete', path);
  }
}

export const STRONG_PASSWORD = 'correct-horse-battery-42';

/** Signs up, verifies email and completes onboarding. Returns the logged-in client. */
export async function createUser(
  ctx: TestContext,
  opts: { email?: string; verify?: boolean; onboard?: boolean; ip?: string; handle?: string } = {},
) {
  const email = opts.email ?? `user${Math.random().toString(36).slice(2, 10)}@example.com`;
  const client = ctx.client(opts.ip);
  const res = await client.post('/auth/signup', {
    email,
    password: STRONG_PASSWORD,
    acceptTerms: true,
  });
  if (res.status !== 201)
    throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  if (opts.verify !== false) {
    const token = extractToken(ctx.emails.lastTo(email)!.text, 'verify-email');
    await client.post('/auth/verify-email', { token });
  }
  if (opts.onboard !== false) {
    const onboard = await client.post('/me/onboarding', {
      handle: opts.handle ?? `h${Math.random().toString(36).slice(2, 10)}`,
      displayName: 'Test User',
      timeZone: 'Europe/Bucharest',
      birthYear: 1995,
      goal: 'learn',
      languages: ['python'],
    });
    if (onboard.status !== 200)
      throw new Error(`onboarding failed: ${JSON.stringify(onboard.body)}`);
  }
  const user = await ctx.prisma.user.findUniqueOrThrow({ where: { email } });
  return { client, email, user };
}

export function extractToken(text: string, path: string): string {
  const m = new RegExp(`/${path}\\?token=([A-Za-z0-9_-]+)`).exec(text);
  if (!m) throw new Error(`no ${path} token in email:\n${text}`);
  return m[1]!;
}
