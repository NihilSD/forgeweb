/**
 * Spec L10 acceptance: integration tests with signed Stripe test webhooks for every event we act
 * on, including duplicates and out-of-order delivery; a Free user can't reach any Pro endpoint by
 * calling the API directly.
 */
import { resolve } from 'node:path';
import { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BillingQueueService } from '../src/billing/billing-queue.service.js';
import { BillingService } from '../src/billing/billing.service.js';
import { type StripeApi, testSignature } from '../src/billing/stripe-client.js';
import { importCourses } from '../src/courses/course-importer.js';
import { importProblems } from '../src/problems/importer.js';
import { createTestContext, createUser, type TestContext } from './helpers.js';

const ROOT = resolve(import.meta.dirname, '../../../content/problems');
const SECRET = process.env.STRIPE_WEBHOOK_SECRET!;
const DAY = 86_400;
let ctx: TestContext;
let seq = 0;

beforeAll(async () => {
  ctx = await createTestContext();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await ctx.reset();
  ctx.app.get(BillingService).useStripeApi(null);
});

// ---------------------------------------------------------------- Stripe event builders

function event(type: string, object: Record<string, unknown>, created: number) {
  return {
    id: `evt_test_${++seq}_${Date.now()}`,
    object: 'event',
    type,
    created,
    data: { object },
  };
}

function subscription(
  id: string,
  opts: {
    customer: string;
    status: string;
    userId?: string;
    interval?: 'month' | 'year';
    periodEnd?: number;
    cancelAtPeriodEnd?: boolean;
  },
) {
  return {
    id,
    object: 'subscription',
    customer: opts.customer,
    status: opts.status,
    cancel_at_period_end: opts.cancelAtPeriodEnd ?? false,
    metadata: opts.userId ? { userId: opts.userId } : {},
    currency: 'eur',
    items: {
      data: [
        {
          id: `si_${id}`,
          current_period_end: opts.periodEnd ?? Math.floor(Date.now() / 1000) + 30 * DAY,
          price: {
            id: 'price_test_monthly',
            currency: 'eur',
            recurring: { interval: opts.interval ?? 'month' },
          },
        },
      ],
    },
  };
}

function invoice(subscriptionId: string) {
  return {
    id: `in_${subscriptionId}_${++seq}`,
    object: 'invoice',
    parent: {
      type: 'subscription_details',
      subscription_details: { subscription: subscriptionId },
    },
  };
}

async function deliver(body: object, opts: { signature?: string } = {}) {
  const payload = JSON.stringify(body);
  return request(ctx.app.getHttpServer())
    .post('/api/v1/billing/webhook')
    .set('content-type', 'application/json')
    .set('stripe-signature', opts.signature ?? testSignature(payload, SECRET))
    .send(payload);
}

/** Waits until the queue has handled (or given up retrying) the event. */
async function settled(eventId: string, statuses = ['processed', 'ignored']) {
  const until = Date.now() + 15_000;
  for (;;) {
    const row = await ctx.prisma.webhookEvent.findUnique({ where: { eventId } });
    if (row && statuses.includes(row.status)) return row;
    if (Date.now() > until) throw new Error(`event ${eventId} stuck: ${row?.status} ${row?.error}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

async function send(type: string, object: Record<string, unknown>, created: number) {
  const e = event(type, object, created);
  const res = await deliver(e);
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return e;
}

const plan = (userId: string, now?: Date) => ctx.app.get(BillingService).planFor(userId, now);
const now = () => Math.floor(Date.now() / 1000);

/** Subscribes a user through the real webhook path. */
async function makePro(userId: string, sub = `sub_${userId.slice(0, 8)}`) {
  const e = await send(
    'customer.subscription.created',
    subscription(sub, { customer: `cus_${userId.slice(0, 8)}`, status: 'active', userId }),
    now(),
  );
  await settled(e.id);
  expect(await plan(userId)).toBe('pro');
  return sub;
}

// ---------------------------------------------------------------- webhooks

describe('Stripe webhooks', () => {
  it('only accepts correctly signed events', async () => {
    const e = event('customer.subscription.created', {}, now());
    expect((await deliver(e, { signature: 't=1,v1=deadbeef' })).status).toBe(401);
    const otherSecret = testSignature(JSON.stringify(e), 'whsec_wrong_secret_000000000000');
    expect((await deliver(e, { signature: otherSecret })).status).toBe(401);
    expect(
      (
        await request(ctx.app.getHttpServer())
          .post('/api/v1/billing/webhook')
          .set('content-type', 'application/json')
          .send(JSON.stringify(e))
      ).status,
    ).toBe(401);
    expect(await ctx.prisma.webhookEvent.count()).toBe(0);
  });

  it('checkout.session.completed links the customer; subscription events grant Pro', async () => {
    const { client, user } = await createUser(ctx);
    const checkout = await send(
      'checkout.session.completed',
      {
        id: 'cs_test_1',
        object: 'checkout.session',
        client_reference_id: user.id,
        customer: 'cus_A',
        subscription: 'sub_A',
        metadata: { userId: user.id },
      },
      now(),
    );
    await settled(checkout.id);
    expect(
      (await ctx.prisma.billingCustomer.findUniqueOrThrow({ where: { userId: user.id } }))
        .stripeCustomerId,
    ).toBe('cus_A');
    expect(await plan(user.id)).toBe('free');

    // No userId in metadata: resolved through the linked customer.
    const created = await send(
      'customer.subscription.created',
      subscription('sub_A', { customer: 'cus_A', status: 'active', interval: 'year' }),
      now(),
    );
    await settled(created.id);
    expect(await plan(user.id)).toBe('pro');
    expect((await client.get('/me')).body.plan).toBe('pro');
    expect((await client.get('/me/entitlements')).body.hintLevelsPerDay).toBeNull();
    const status = await client.get('/billing/status');
    expect(status.body).toMatchObject({
      plan: 'pro',
      subscription: { status: 'active', interval: 'year', cancelAtPeriodEnd: false },
    });
  });

  it('processes a duplicate delivery once', async () => {
    const { user } = await createUser(ctx);
    const e = event(
      'customer.subscription.created',
      subscription('sub_D', { customer: 'cus_D', status: 'active', userId: user.id }),
      now(),
    );
    const first = await deliver(e);
    const second = await deliver(e);
    expect(first.body).toEqual({ received: true, duplicate: false });
    expect(second.body).toEqual({ received: true, duplicate: true });
    await settled(e.id);
    expect(await ctx.prisma.webhookEvent.count({ where: { eventId: e.id } })).toBe(1);
    expect(
      await ctx.prisma.auditLog.count({
        where: { action: 'billing.plan_changed', target: user.id },
      }),
    ).toBe(1);
  });

  it('ignores stale events delivered out of order', async () => {
    const { user } = await createUser(ctx);
    const t = now();
    const deleted = await send(
      'customer.subscription.deleted',
      subscription('sub_O', { customer: 'cus_O', status: 'canceled', userId: user.id }),
      t + 100,
    );
    await settled(deleted.id);
    // The older "active" update arrives last and must not resurrect Pro.
    const older = await send(
      'customer.subscription.updated',
      subscription('sub_O', { customer: 'cus_O', status: 'active', userId: user.id }),
      t,
    );
    await settled(older.id);
    expect(await plan(user.id)).toBe('free');
    expect(
      (
        await ctx.prisma.subscription.findUniqueOrThrow({
          where: { stripeSubscriptionId: 'sub_O' },
        })
      ).status,
    ).toBe('canceled');
  });

  it('retries a subscription event that arrives before its checkout', async () => {
    const { user } = await createUser(ctx);
    const early = await send(
      'customer.subscription.created',
      subscription('sub_E', { customer: 'cus_E', status: 'active' }),
      now(),
    );
    const failed = await settled(early.id, ['failed']);
    expect(failed.error).toMatch(/no user/);
    const checkout = await send(
      'checkout.session.completed',
      { id: 'cs_E', client_reference_id: user.id, customer: 'cus_E', metadata: {} },
      now(),
    );
    await settled(checkout.id);
    // The queue's retry (with backoff) applies it; run it now instead of waiting.
    await ctx.app.get(BillingQueueService).process(early.id);
    expect((await settled(early.id)).status).toBe('processed');
    expect(await plan(user.id)).toBe('pro');
  });

  it('keeps Pro for 7 days after a failed payment, then downgrades; payment restores it', async () => {
    const { user } = await createUser(ctx);
    const sub = await makePro(user.id);
    const t = now();
    const failed = await send('invoice.payment_failed', invoice(sub), t);
    await settled(failed.id);
    const row = await ctx.prisma.subscription.findUniqueOrThrow({
      where: { stripeSubscriptionId: sub },
    });
    expect(row.graceUntil!.getTime()).toBe((t + 7 * DAY) * 1000);
    const pastDue = await send(
      'customer.subscription.updated',
      subscription(sub, {
        customer: `cus_${user.id.slice(0, 8)}`,
        status: 'past_due',
        userId: user.id,
      }),
      t + 1,
    );
    await settled(pastDue.id);
    expect(await plan(user.id)).toBe('pro');
    expect(await plan(user.id, new Date((t + 6 * DAY) * 1000))).toBe('pro');
    expect(await plan(user.id, new Date((t + 8 * DAY) * 1000))).toBe('free');

    const paid = await send('invoice.paid', invoice(sub), t + 2 * DAY);
    await settled(paid.id);
    const active = await send(
      'customer.subscription.updated',
      subscription(sub, {
        customer: `cus_${user.id.slice(0, 8)}`,
        status: 'active',
        userId: user.id,
      }),
      t + 2 * DAY + 1,
    );
    await settled(active.id);
    expect(await plan(user.id, new Date((t + 30 * DAY) * 1000))).toBe('pro');
    expect(
      (await ctx.prisma.subscription.findUniqueOrThrow({ where: { stripeSubscriptionId: sub } }))
        .graceUntil,
    ).toBeNull();
  });

  it('starts the grace period when past_due arrives before the failed invoice', async () => {
    const { user } = await createUser(ctx);
    const sub = await makePro(user.id);
    const t = now();
    const pastDue = await send(
      'customer.subscription.updated',
      subscription(sub, { customer: 'c', status: 'past_due', userId: user.id }),
      t,
    );
    await settled(pastDue.id);
    expect(await plan(user.id)).toBe('pro');
    // An older failed invoice arriving after a newer paid one changes nothing.
    const paid = await send('invoice.paid', invoice(sub), t + 50);
    await settled(paid.id);
    const staleFail = await send('invoice.payment_failed', invoice(sub), t + 10);
    await settled(staleFail.id);
    expect(
      (await ctx.prisma.subscription.findUniqueOrThrow({ where: { stripeSubscriptionId: sub } }))
        .graceUntil,
    ).toBeNull();
  });

  it('keeps Pro until a cancelled subscription ends', async () => {
    const { user } = await createUser(ctx);
    const sub = await makePro(user.id);
    const cancel = await send(
      'customer.subscription.updated',
      subscription(sub, {
        customer: 'c',
        status: 'active',
        userId: user.id,
        cancelAtPeriodEnd: true,
      }),
      now() + 1,
    );
    await settled(cancel.id);
    expect(await plan(user.id)).toBe('pro');
    const ended = await send(
      'customer.subscription.deleted',
      subscription(sub, { customer: 'c', status: 'canceled', userId: user.id }),
      now() + 2,
    );
    await settled(ended.id);
    expect(await plan(user.id)).toBe('free');
  });

  it('records but ignores event types it does not act on', async () => {
    const e = await send('customer.created', { id: 'cus_X' }, now());
    expect((await settled(e.id)).status).toBe('ignored');
  });
});

// ---------------------------------------------------------------- checkout, portal, invoices

function fakeStripe() {
  const calls: { method: string; params: unknown }[] = [];
  const api: StripeApi = {
    customers: {
      create: async (params) => {
        calls.push({ method: 'customers.create', params });
        return { id: `cus_fake_${calls.length}` };
      },
    },
    checkout: {
      sessions: {
        create: async (params) => {
          calls.push({ method: 'checkout.sessions.create', params });
          return { url: 'https://checkout.stripe.test/session' };
        },
      },
    },
    billingPortal: {
      sessions: {
        create: async (params) => {
          calls.push({ method: 'billingPortal.sessions.create', params });
          return { url: 'https://billing.stripe.test/portal' };
        },
      },
    },
    invoices: {
      list: async (params) => {
        calls.push({ method: 'invoices.list', params });
        return {
          data: [
            {
              id: 'in_1',
              number: 'FORGE-0001',
              created: 1_790_000_000,
              total: 1452,
              currency: 'eur',
              status: 'paid',
              hosted_invoice_url: 'https://invoice.stripe.test/1',
              invoice_pdf: 'https://invoice.stripe.test/1.pdf',
            },
          ] as never,
        };
      },
    },
  };
  return { api, calls };
}

describe('checkout and billing pages', () => {
  it('is unavailable until Stripe is configured', async () => {
    const { client } = await createUser(ctx);
    const res = await client.post('/billing/checkout', { interval: 'month' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect((await ctx.client().get('/billing/prices')).body.available).toBe(false);
  });

  it('starts Checkout with the regional price, Stripe Tax and the user reference', async () => {
    const fake = fakeStripe();
    ctx.app.get(BillingService).useStripeApi(fake.api);
    const { client, user } = await createUser(ctx);
    await ctx.prisma.user.update({ where: { id: user.id }, data: { country: 'RO' } });
    const res = await client.post('/billing/checkout', { interval: 'year' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.url).toBe('https://checkout.stripe.test/session');
    const session = fake.calls.find((c) => c.method === 'checkout.sessions.create')!
      .params as Record<string, unknown>;
    expect(session).toMatchObject({
      mode: 'subscription',
      client_reference_id: user.id,
      line_items: [{ price: 'price_test_yearly_reduced', quantity: 1 }],
      automatic_tax: { enabled: true },
      subscription_data: { metadata: { userId: user.id } },
    });
    // The customer is created once and reused.
    await client.post('/billing/checkout', { interval: 'month' });
    expect(fake.calls.filter((c) => c.method === 'customers.create')).toHaveLength(1);
    expect((await client.get('/billing/prices')).body).toMatchObject({
      tier: 'reduced',
      available: true,
    });
    expect((await ctx.client().get('/billing/prices')).body.tier).toBe('standard');
    expect((await client.post('/billing/checkout', { interval: 'week' })).status).toBe(400);
  });

  it('refuses checkout for Pro users and unverified emails', async () => {
    ctx.app.get(BillingService).useStripeApi(fakeStripe().api);
    const pro = await createUser(ctx);
    await makePro(pro.user.id);
    expect((await pro.client.post('/billing/checkout', { interval: 'month' })).status).toBe(409);
    const unverified = await createUser(ctx, { verify: false });
    expect((await unverified.client.post('/billing/checkout', { interval: 'month' })).status).toBe(
      403,
    );
  });

  it('opens the customer portal and lists invoices for the user only', async () => {
    const fake = fakeStripe();
    ctx.app.get(BillingService).useStripeApi(fake.api);
    const { client, user } = await createUser(ctx);
    expect((await client.post('/billing/portal')).status).toBe(404);
    expect((await client.get('/billing/invoices')).body.items).toEqual([]);
    await ctx.prisma.billingCustomer.create({
      data: { userId: user.id, stripeCustomerId: 'cus_portal' },
    });
    expect((await client.post('/billing/portal')).body.url).toBe(
      'https://billing.stripe.test/portal',
    );
    const invoices = await client.get('/billing/invoices');
    expect(invoices.body.items[0]).toMatchObject({
      number: 'FORGE-0001',
      total: 1452,
      currency: 'eur',
    });
    expect(fake.calls.find((c) => c.method === 'invoices.list')!.params).toMatchObject({
      customer: 'cus_portal',
    });
    expect((await ctx.client().get('/billing/invoices')).status).toBe(401);
  });
});

// ---------------------------------------------------------------- Pro endpoints

describe('Pro endpoints are enforced in the API', () => {
  beforeEach(async () => {
    await importProblems(ctx.prisma, ROOT, { publishDrafts: true });
    await importCourses(ctx.prisma, resolve(ROOT, '../courses'), { publishDrafts: true });
    const q = new Redis(process.env.RUNNER_REDIS_URL!);
    await q.flushdb();
    await q.quit();
  });

  /** Every Pro-only capability, called directly. Each returns [free status, pro status]. */
  const CASES: [string, (c: Awaited<ReturnType<typeof createUser>>) => Promise<number>][] = [
    [
      'editorial (after giving up)',
      async ({ client }) => {
        await client.post('/problems/two-sum-orders/give-up');
        return (await client.get('/problems/two-sum-orders/editorial')).status;
      },
    ],
    ['review queue', async ({ client }) => (await client.get('/me/review')).status],
    [
      'more than 3 hint levels a day',
      async ({ client }) => {
        for (const l of [1, 2, 3]) await client.post(`/problems/two-sum-orders/hints/${l}/reveal`);
        return (await client.post('/problems/two-sum-orders/hints/4/reveal')).status;
      },
    ],
    [
      'lessons after the first three',
      async ({ client }) => (await client.get('/courses/python-basics/lessons/lists')).status,
    ],
    [
      'a fourth verified challenge in a week',
      async ({ client }) => {
        for (let i = 0; i < 3; i++) {
          const a = await client.post('/verified/two-sum-orders/attempts', {
            consent: true,
            language: 'python',
          });
          await ctx.prisma.attempt.update({
            where: { id: a.body.id },
            data: { status: 'expired' },
          });
        }
        return (
          await client.post('/verified/two-sum-orders/attempts', {
            consent: true,
            language: 'python',
          })
        ).status;
      },
    ],
  ];

  for (const [name, call] of CASES) {
    it(`blocks Free and allows Pro: ${name}`, async () => {
      const free = await createUser(ctx);
      const freeStatus = await call(free);
      expect([402, 403]).toContain(freeStatus);
      const pro = await createUser(ctx);
      await makePro(pro.user.id);
      expect(await call(pro)).toBeLessThan(300);
    });
  }

  it('downgrades access as soon as the subscription ends', async () => {
    const u = await createUser(ctx);
    const sub = await makePro(u.user.id);
    expect((await u.client.get('/me/review')).status).toBe(200);
    const ended = await send(
      'customer.subscription.deleted',
      subscription(sub, { customer: 'c', status: 'canceled', userId: u.user.id }),
      now() + 5,
    );
    await settled(ended.id);
    expect((await u.client.get('/me/review')).status).toBe(402);
  });
});
