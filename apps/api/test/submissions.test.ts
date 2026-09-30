import { resolve } from 'node:path';
import { signCallback } from '@forge/problem-kit';
import { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { importProblems } from '../src/problems/importer.js';
import { RunnerQueueService } from '../src/submissions/runner-queue.service.js';
import { FakeRunner, waitDone } from './fake-runner.js';
import { createTestContext, createUser, type TestContext } from './helpers.js';

const ROOT = resolve(import.meta.dirname, '../../../content/problems');
let ctx: TestContext;
let runner: FakeRunner;

const AVG_OK = `def average_rating(ratings):
    rated = [r for r in ratings if r]
    return sum(rated) / len(rated) if rated else 0`;
const AVG_BUGGY = `def average_rating(ratings):
    rated = [r for r in ratings[1:] if r]
    return sum(rated) / len(rated) if rated else 0`;

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
  runner.callbacks.length = 0;
});

describe('submissions', () => {
  it('runs visible tests, then submits and gets Accepted', async () => {
    const { client } = await createUser(ctx);
    const run = await client.post('/problems/fix-average-rating/run', {
      language: 'python',
      code: AVG_BUGGY,
    });
    expect(run.status).toBe(202);
    const ran = await waitDone((p) => client.get(p), run.body.id);
    expect(ran.body.kind).toBe('run');
    expect(ran.body.verdict).toBe('wrong_answer');
    expect(ran.body.tests.every((t: { visible: boolean }) => t.visible)).toBe(true);
    expect(ran.body.tests[0]).toHaveProperty('expected');

    const sub = await client.post('/problems/fix-average-rating/submit', {
      language: 'python',
      code: AVG_OK,
    });
    const done = await waitDone((p) => client.get(p), sub.body.id);
    expect(done.body.verdict).toBe('accepted');
    expect(done.body.testsPassed).toBe(done.body.testsTotal);

    const list = await client.get('/problems?status=solved');
    expect(list.body.items.map((p: { slug: string }) => p.slug)).toEqual(['fix-average-rating']);
  });

  it('shows only the category of failed hidden tests', async () => {
    const { client } = await createUser(ctx);
    const code = `def average_rating(ratings):
    if ratings == []:
        return 0
    rated = [r for r in ratings if r]
    if ratings[0] == 5 and len(ratings) < 8:
        return sum(rated) / len(rated)
    return 1`;
    const sub = await client.post('/problems/fix-average-rating/submit', {
      language: 'python',
      code,
    });
    const done = await waitDone((p) => client.get(p), sub.body.id);
    expect(done.body.verdict).toBe('wrong_answer');
    const hidden = done.body.tests.filter((t: { visible: boolean }) => !t.visible);
    expect(hidden.length).toBeGreaterThan(0);
    for (const t of hidden) {
      expect(Object.keys(t).sort()).toEqual([
        'category',
        'id',
        'passed',
        'timeMs',
        'verdict',
        'visible',
      ]);
    }
  });

  it('runs custom input and returns the output', async () => {
    const { client } = await createUser(ctx);
    const run = await client.post('/problems/fix-average-rating/run', {
      language: 'javascript',
      code: 'function averageRating(r) { console.log("hi"); return r.length }',
      customArgs: [[1, 2, 3]],
    });
    const done = await waitDone((p) => client.get(p), run.body.id);
    expect(done.body.customOutput).toEqual({ value: 3, stdout: 'hi\n' });
  });

  it('grades SQL', async () => {
    const { client } = await createUser(ctx);
    const detail = await client.get('/problems/city-top-customers');
    const city = /customers in \*\*(\w+)\*\*/.exec(detail.body.statement)![1];
    const min = /at least ([\d.]+)\*\*/.exec(detail.body.statement)![1];
    const code = `SELECT c.name, COALESCE(SUM(o.amount), 0) AS total FROM customers c LEFT JOIN orders o ON o.customer_id = c.id
WHERE c.city = '${city}' GROUP BY c.id, c.name HAVING COALESCE(SUM(o.amount), 0) >= ${min} ORDER BY total DESC, c.name`;
    const sub = await client.post('/problems/city-top-customers/submit', { language: 'sql', code });
    const done = await waitDone((p) => client.get(p), sub.body.id);
    expect(done.body.verdict).toBe('accepted');
  });

  it('is idempotent with an Idempotency-Key', async () => {
    const { client } = await createUser(ctx);
    const headers = { 'idempotency-key': 'retry-key-123456' };
    const a = await client.req(
      'post',
      '/problems/fix-average-rating/submit',
      { language: 'python', code: AVG_OK },
      { headers },
    );
    const b = await client.req(
      'post',
      '/problems/fix-average-rating/submit',
      { language: 'python', code: AVG_OK },
      { headers },
    );
    expect(a.body.id).toBe(b.body.id);
    expect(await ctx.prisma.submission.count()).toBe(1);
  });

  it('validates input', async () => {
    const { client } = await createUser(ctx);
    const big = await client.post('/problems/fix-average-rating/submit', {
      language: 'python',
      code: 'x'.repeat(70_000),
    });
    expect(big.status).toBe(400);
    const lang = await client.post('/problems/fix-average-rating/submit', {
      language: 'sql',
      code: 'SELECT 1',
    });
    expect(lang.body.error.code).toBe('VALIDATION_FAILED');
    const flag = await client.post('/problems/caesar-intercept/submit', {
      language: 'python',
      code: 'x = 1',
    });
    expect(flag.status).toBe(400);
  });

  it("requires sign-in and hides other users' submissions", async () => {
    const anon = await ctx
      .client()
      .post('/problems/fix-average-rating/submit', { language: 'python', code: AVG_OK });
    expect(anon.status).toBe(401);
    const a = await createUser(ctx);
    const b = await createUser(ctx);
    const sub = await a.client.post('/problems/fix-average-rating/submit', {
      language: 'python',
      code: AVG_OK,
    });
    expect((await b.client.get(`/submissions/${sub.body.id}`)).status).toBe(404);
    expect((await b.client.get('/problems/fix-average-rating/submissions')).body.items).toEqual([]);
    await waitDone((p) => a.client.get(p), sub.body.id);
  });

  it('caps unfinished submissions per user', async () => {
    await runner.stop();
    try {
      const { client } = await createUser(ctx);
      const statuses: number[] = [];
      for (let i = 0; i < 4; i++) {
        statuses.push(
          (
            await client.post('/problems/fix-average-rating/submit', {
              language: 'python',
              code: AVG_OK,
            })
          ).status,
        );
      }
      expect(statuses).toEqual([202, 202, 202, 429]);
    } finally {
      runner = new FakeRunner(ctx.app).start();
    }
  });
});

describe('runner callbacks', () => {
  async function queuedSubmission() {
    await runner.stop();
    const { client } = await createUser(ctx);
    const sub = await client.post('/problems/fix-average-rating/submit', {
      language: 'python',
      code: AVG_OK,
    });
    const row = await ctx.prisma.submission.findUniqueOrThrow({ where: { id: sub.body.id } });
    runner = new FakeRunner(ctx.app);
    return { client, row };
  }
  const post = (body: string, headers: Record<string, string>) =>
    request(ctx.app.getHttpServer())
      .post('/api/v1/internal/runner/callback')
      .set('content-type', 'application/json')
      .set(headers)
      .send(body);
  const result = { status: 'ok', tests: [], timeMs: 1, memoryKb: null };

  it('rejects unsigned and forged callbacks', async () => {
    const { row } = await queuedSubmission();
    const body = JSON.stringify({ jobId: row.jobId, runnerId: 'x', result });
    expect((await post(body, {})).status).toBe(401);
    const forged = signCallback(
      { signing: { id: 'c1', secret: 'attacker-secret-0000000000000000000' }, all: new Map() },
      body,
    );
    expect((await post(body, forged as unknown as Record<string, string>)).status).toBe(401);
    const keys = ctx.app.get(RunnerQueueService).callbackKeys;
    const stale = signCallback(keys, body, Date.now() - 10 * 60_000);
    expect((await post(body, stale as unknown as Record<string, string>)).status).toBe(401);
    const tampered = signCallback(keys, body);
    expect(
      (await post(body.replace('"ok"', '"ok" '), tampered as unknown as Record<string, string>))
        .status,
    ).toBe(401);
    runner.start();
  });

  it('rejects replayed callbacks', async () => {
    const { row } = await queuedSubmission();
    const keys = ctx.app.get(RunnerQueueService).callbackKeys;
    const body = JSON.stringify({ jobId: row.jobId, runnerId: 'x', result });
    const h = signCallback(keys, body) as unknown as Record<string, string>;
    expect((await post(body, h)).status).toBe(200);
    expect((await post(body, h)).status).toBe(409);
    runner.start();
  });

  it('retries an internal error once and never counts it against the user', async () => {
    const { client, row } = await queuedSubmission();
    const keys = ctx.app.get(RunnerQueueService).callbackKeys;
    const fail = (jobId: string) => {
      const body = JSON.stringify({
        jobId,
        runnerId: 'x',
        result: {
          status: 'internal_error',
          tests: [],
          timeMs: 0,
          memoryKb: null,
          message: 'docker down',
        },
      });
      return post(body, signCallback(keys, body) as unknown as Record<string, string>);
    };
    expect((await fail(row.jobId!)).body.outcome).toBe('retried');
    const retried = await ctx.prisma.submission.findUniqueOrThrow({ where: { id: row.id } });
    expect(retried.jobId).not.toBe(row.jobId);
    expect(retried.attempts).toBe(2);
    // The old job id is dead.
    expect((await fail(row.jobId!)).status).toBe(409);
    expect((await fail(retried.jobId!)).body.outcome).toBe('stored');
    const final = await client.get(`/submissions/${row.id}`);
    expect(final.body.verdict).toBe('internal_error');
    expect((await client.get('/problems?status=solved')).body.items).toEqual([]);
    runner.start();
  });
});
