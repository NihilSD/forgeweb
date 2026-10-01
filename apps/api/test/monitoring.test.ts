/**
 * Spec L13 acceptance: alerts reach the owner when the runner is stopped (tested here; the live
 * check is in docs/runbooks/runner-incident.md). Also queue backlog, failing webhooks, the public
 * status endpoint and the metrics endpoint.
 */
import { resolve } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '../src/common/api-error.js';
import { ErrorFilter } from '../src/common/error.filter.js';
import { MonitoringService } from '../src/monitoring/monitoring.service.js';
import { importProblems } from '../src/problems/importer.js';
import { RedisService } from '../src/infra/redis.service.js';
import { RunnerQueueService } from '../src/submissions/runner-queue.service.js';
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
  const runnerRedis = ctx.app.get(RunnerQueueService).connection;
  await runnerRedis.flushdb();
  await mainRedis().set('monitoring:last-backup', String(Math.floor(Date.now() / 1000)));
});

const beat = (id = 'runner-1') =>
  ctx.app
    .get(RunnerQueueService)
    .connection.set(
      `runner:heartbeat:${id}`,
      JSON.stringify({ at: Date.now(), runtime: 'runsc' }),
      'EX',
      30,
    );
const mainRedis = () => ctx.app.get(RedisService).client;
const alerts = () => ctx.emails.outbox.filter((m) => m.to === 'ops@example.com');

describe('runner health alerts', () => {
  it('alerts once when every runner stops, and once when one comes back', async () => {
    const mon = ctx.app.get(MonitoringService);
    await beat();
    await mon.check();
    expect(alerts()).toHaveLength(0);

    await ctx.app.get(RunnerQueueService).connection.del('runner:heartbeat:runner-1');
    await mon.check();
    expect(alerts()).toHaveLength(1);
    expect(alerts()[0]!.subject).toMatch(/FIRING.*runner/i);
    await mon.check();
    expect(alerts()).toHaveLength(1); // no repeat while it stays down

    await beat();
    await mon.check();
    expect(alerts()).toHaveLength(2);
    expect(alerts()[1]!.subject).toMatch(/RESOLVED.*runner/i);
  });

  it('alerts on a submission backlog and on webhooks that keep failing', async () => {
    await importProblems(ctx.prisma, ROOT, { publishDrafts: true });
    const { user } = await createUser(ctx);
    await beat();
    const p = await ctx.prisma.problem.findFirstOrThrow();
    await ctx.prisma.submission.create({
      data: {
        userId: user.id,
        problemId: p.id,
        version: p.version,
        language: 'python',
        code: 'x',
        kind: 'run',
        seed: 1,
        status: 'queued',
        createdAt: new Date(Date.now() - 5 * 60_000),
      },
    });
    await ctx.prisma.webhookEvent.create({
      data: {
        eventId: 'evt_stuck',
        type: 'invoice.paid',
        created: 1,
        payload: {},
        status: 'failed',
        createdAt: new Date(Date.now() - 60 * 60_000),
      },
    });
    await ctx.app.get(MonitoringService).check();
    const subjects = alerts()
      .map((m) => m.subject)
      .join('\n');
    expect(subjects).toMatch(/backlog/i);
    expect(subjects).toMatch(/webhook/i);
    // Alerts never include user data.
    expect(JSON.stringify(alerts())).not.toContain(user.email);
  });
});

describe('backup freshness', () => {
  it('alerts when the last backup is older than BACKUP_MAX_AGE_HOURS, and when none exists', async () => {
    const mon = ctx.app.get(MonitoringService);
    await beat();
    await mon.check();
    expect(alerts()).toHaveLength(0);
    await mainRedis().set(
      'monitoring:last-backup',
      String(Math.floor(Date.now() / 1000) - 27 * 3600),
    );
    await mon.check();
    expect(alerts().at(-1)!.subject).toMatch(/FIRING.*backup/i);
    await mainRedis().set('monitoring:last-backup', String(Math.floor(Date.now() / 1000)));
    await mon.check();
    expect(alerts().at(-1)!.subject).toMatch(/RESOLVED.*backup/i);
    await mainRedis().del('monitoring:last-backup');
    await mon.check();
    expect(alerts().at(-1)!.subject).toMatch(/FIRING.*backup/i);
  });
});

describe('error tracking', () => {
  it('alerts when the API returns a burst of 500s, and the filter records them', async () => {
    const mon = ctx.app.get(MonitoringService);
    await beat();
    // The real filter path: an unexpected exception is a 500 and is counted.
    const filter = new ErrorFilter(mon);
    const res = { headersSent: false, status: () => res, json: () => res };
    const host = { switchToHttp: () => ({ getResponse: () => res }) };
    filter.catch(new Error('boom'), host as never);
    filter.catch(ApiError.notFound(), host as never); // 4xx is not an error to track
    await new Promise((r) => setTimeout(r, 50));
    expect((await mon.snapshot()).serverErrors5m).toBe(1);

    for (let i = 0; i < 9; i++) await mon.recordServerError();
    await mon.check();
    expect(
      alerts()
        .map((m) => m.subject)
        .join('\n'),
    ).toMatch(/FIRING.*error/i);
  });
});

describe('status and metrics', () => {
  it('serves a public status summary without internals', async () => {
    await beat('runner-secret-name');
    const res = await request(ctx.app.getHttpServer()).get('/api/v1/status');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ api: 'ok', database: 'ok', runners: 'ok' });
    expect(JSON.stringify(res.body)).not.toMatch(/runner-secret-name|redis:\/\/|postgres/);
    await ctx.app.get(RunnerQueueService).connection.flushdb();
    expect((await request(ctx.app.getHttpServer()).get('/api/v1/status')).body.runners).toBe(
      'down',
    );
  });

  it('exposes Prometheus metrics only with the token', async () => {
    await beat();
    const server = ctx.app.getHttpServer();
    expect((await request(server).get('/api/v1/internal/metrics')).status).toBe(401);
    expect(
      (await request(server).get('/api/v1/internal/metrics').set('authorization', 'Bearer nope'))
        .status,
    ).toBe(401);
    const ok = await request(server)
      .get('/api/v1/internal/metrics')
      .set('authorization', `Bearer ${process.env.METRICS_TOKEN}`);
    expect(ok.status).toBe(200);
    expect(ok.text).toMatch(/^forge_runners_alive 1$/m);
    expect(ok.text).toMatch(/^forge_runner_queue_waiting \d+$/m);
    expect(ok.text).toMatch(/^forge_submission_oldest_queued_seconds \d+/m);
    expect(ok.text).toMatch(/^forge_http_5xx_last_5m \d+$/m);
    expect(ok.text).toMatch(/^forge_backup_age_seconds \d+$/m);
  });

  it('includes product analytics as aggregate counts only (no personal data)', async () => {
    const { user } = await createUser(ctx);
    await createUser(ctx);
    const ok = await request(ctx.app.getHttpServer())
      .get('/api/v1/internal/metrics')
      .set('authorization', `Bearer ${process.env.METRICS_TOKEN}`);
    expect(ok.text).toMatch(/^forge_users_total 2$/m);
    expect(ok.text).toMatch(/^forge_signups_24h 2$/m);
    expect(ok.text).toMatch(/^forge_active_users_24h \d+$/m);
    expect(ok.text).toMatch(/^forge_submissions_24h 0$/m);
    expect(ok.text).toMatch(/^forge_pro_subscriptions 0$/m);
    expect(ok.text).not.toContain(user.email);
    expect(ok.text).not.toContain(user.id);
  });
});
