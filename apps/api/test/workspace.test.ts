import { resolve } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fileText } from '@forge/problem-kit';
import { FlagsService } from '../src/flags/flags.service.js';
import { importProblems } from '../src/problems/importer.js';
import { createTestContext, createUser, type TestClient, type TestContext } from './helpers.js';

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
});

describe('drafts', () => {
  it('saves one draft per language and returns them', async () => {
    const { client } = await createUser(ctx);
    expect(
      (await client.req('put', '/problems/two-sum-orders/drafts/python', { code: 'print(1)' }))
        .status,
    ).toBe(200);
    await client.req('put', '/problems/two-sum-orders/drafts/python', { code: 'print(2)' });
    await client.req('put', '/problems/two-sum-orders/drafts/javascript', { code: 'x' });
    const res = await client.get('/problems/two-sum-orders/drafts');
    const byLang = Object.fromEntries(
      res.body.items.map((d: { language: string; code: string }) => [d.language, d.code]),
    );
    expect(byLang).toEqual({ python: 'print(2)', javascript: 'x' });
  });

  it('keeps drafts private and validates languages', async () => {
    const a = await createUser(ctx);
    const b = await createUser(ctx);
    await a.client.req('put', '/problems/two-sum-orders/drafts/python', { code: 'secret' });
    expect((await b.client.get('/problems/two-sum-orders/drafts')).body.items).toEqual([]);
    expect(
      (await a.client.req('put', '/problems/two-sum-orders/drafts/sql', { code: 'x' })).status,
    ).toBe(404);
    expect(
      (await a.client.req('put', '/problems/two-sum-orders/drafts/cobol', { code: 'x' })).status,
    ).toBe(400);
    expect((await ctx.client().get('/problems/two-sum-orders/drafts')).status).toBe(401);
  });
});

describe('flag challenges', () => {
  async function download(client: TestClient) {
    const list = await client.get('/problems/caesar-intercept/files');
    expect(list.status).toBe(200);
    const file = list.body.items[0] as { name: string; url: string };
    const res = await client.get(file.url.replace('/api/v1', ''));
    // Downloads are octet-stream, so supertest gives a Buffer body rather than text.
    const text = Buffer.isBuffer(res.body) ? res.body.toString('utf8') : (res.text ?? '');
    return { file, res, text };
  }

  function decode(text: string): string {
    for (let k = 0; k < 26; k++) {
      const plain = text.replace(/[a-z]/gi, (c) => {
        const b = c <= 'Z' ? 65 : 97;
        return String.fromCharCode(((c.charCodeAt(0) - b - k + 26) % 26) + b);
      });
      const m = /FORGE\{[0-9a-f]{24}\}/.exec(plain);
      if (m) return m[0];
    }
    throw new Error('no flag');
  }

  it('serves files through short-lived signed URLs bound to the user', async () => {
    const a = await createUser(ctx);
    const b = await createUser(ctx);
    const { file, res } = await download(a.client);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/attachment/);
    // Someone else can't use the link, even signed in.
    expect((await b.client.get(file.url.replace('/api/v1', ''))).status).toBe(403);
    // Tampered or expired links fail.
    expect(
      (await a.client.get(file.url.replace('/api/v1', '').replace(/sig=[^&]+/, 'sig=abc'))).status,
    ).toBe(403);
    const expired = file.url.replace(/exp=\d+/, `exp=${Date.now() - 1000}`);
    expect((await a.client.get(expired.replace('/api/v1', ''))).status).toBe(403);
    // Anonymous: no session, no file.
    const anon = await request(ctx.app.getHttpServer()).get(file.url);
    expect(anon.status).toBe(401);
  });

  it("accepts the user's own flag and marks the challenge solved", async () => {
    const { client } = await createUser(ctx);
    const { text } = await download(client);
    const flag = decode(text);
    const wrong = await client.post('/problems/caesar-intercept/flag', {
      flag: 'FORGE{000000000000000000000000}',
    });
    expect(wrong.body.correct).toBe(false);
    const ok = await client.post('/problems/caesar-intercept/flag', { flag });
    expect(ok.body.correct).toBe(true);
    const solved = await client.get('/problems?status=solved');
    expect(solved.body.items.map((p: { slug: string }) => p.slug)).toEqual(['caesar-intercept']);
  });

  it('rejects and logs a flag from user A submitted by user B', async () => {
    const a = await createUser(ctx);
    const b = await createUser(ctx);
    const flagA = decode((await download(a.client)).text);
    const res = await b.client.post('/problems/caesar-intercept/flag', { flag: flagA });
    expect(res.body.correct).toBe(false);
    const sub = await ctx.prisma.flagSubmission.findFirstOrThrow({ where: { userId: b.user.id } });
    expect(sub.sharedFrom).toBe(a.user.id);
    expect(
      await ctx.prisma.auditLog.count({
        where: { action: 'flag.shared_suspected', actorId: b.user.id },
      }),
    ).toBe(1);
    // The flag itself is never stored.
    expect(JSON.stringify(await ctx.prisma.flagSubmission.findMany())).not.toContain(flagA);
    expect(JSON.stringify(await ctx.prisma.flagIssue.findMany())).not.toContain(flagA);
  });

  it("never puts another user's flag in any challenge's files (every flag problem, many users)", async () => {
    const flags = ctx.app.get(FlagsService);
    const problems = await ctx.prisma.problem.findMany({
      where: { formats: { has: 'flag' } },
      include: { track: true, versions: { take: 1, orderBy: { version: 'desc' } } },
    });
    expect(problems.length).toBeGreaterThanOrEqual(6);
    const users = await Promise.all(
      Array.from({ length: 15 }, (_, i) =>
        ctx.prisma.user.create({ data: { email: `flag${i}@example.com` } }),
      ),
    );
    for (const problem of problems) {
      const loaded = { ...problem, current: problem.versions[0]! };
      const all = users.map((u) => flags.flag(u.id, problem.id));
      expect(new Set(all).size).toBe(users.length);
      for (const [i, u] of users.entries()) {
        const text = Object.values(await flags.files(u.id, loaded))
          .map(fileText)
          .join('\n');
        // Text files carry the flag verbatim or encoded; the check that matters is that no
        // other user's flag appears in any form we can scan for.
        for (const [j, other] of all.entries()) {
          if (j !== i)
            expect(text, `${problem.slug}: user ${i} has user ${j}'s flag`).not.toContain(other);
        }
      }
    }
    // Caesar: the decoded file holds exactly this user's flag.
    const caesar = problems.find((p) => p.slug === 'caesar-intercept')!;
    const files = await flags.files(users[0]!.id, { ...caesar, current: caesar.versions[0]! });
    expect(decode(Object.values(files).map(fileText).join('\n'))).toBe(
      flags.flag(users[0]!.id, caesar.id),
    );
  });

  it('serves binary challenge files byte for byte', async () => {
    const { client, user } = await createUser(ctx);
    const list = await client.get('/problems/pcap-basic-auth/files');
    const file = list.body.items.find((f: { name: string }) => f.name === 'capture.pcap');
    const res = await client.get(file.url.replace('/api/v1', ''));
    expect(res.status).toBe(200);
    const body = res.body as Buffer;
    // pcap magic number, little-endian.
    expect(body.subarray(0, 4).toString('hex')).toBe('d4c3b2a1');
    const flags = ctx.app.get(FlagsService);
    const problem = await ctx.prisma.problem.findUniqueOrThrow({
      where: { slug: 'pcap-basic-auth' },
      include: { track: true, versions: { take: 1, orderBy: { version: 'desc' } } },
    });
    const expected = (await flags.files(user.id, { ...problem, current: problem.versions[0]! }))[
      'capture.pcap'
    ];
    expect(typeof expected).toBe('object');
    expect(body.toString('base64')).toBe((expected as { base64: string }).base64);
  });

  it('only flag problems have files or accept flags', async () => {
    const { client } = await createUser(ctx);
    expect((await client.get('/problems/two-sum-orders/files')).status).toBe(404);
    expect((await client.post('/problems/two-sum-orders/flag', { flag: 'x' })).status).toBe(404);
  });
});
