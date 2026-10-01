import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma, type User } from '@forge/db';
import {
  type BillingInterval,
  type BillingStatus,
  ErrorCode,
  type InvoiceList,
  PAYMENT_GRACE_DAYS,
  type Plan,
  PLAN_PRICES,
  type PriceList,
  type PriceTier,
  priceTierFor,
} from '@forge/shared';
import { AuditService } from '../audit/audit.service.js';
import { ApiError } from '../common/api-error.js';
import { ENV, type Env } from '../config/env.js';
import { PrismaService } from '../infra/prisma.service.js';
import { STRIPE_API, type Stripe, type StripeApi } from './stripe-client.js';

/** Statuses that grant Pro without conditions. */
const ACTIVE = ['active', 'trialing'];
/** Statuses that grant Pro only during the grace period after a failed payment. */
const GRACE = ['past_due', 'unpaid'];

/** Thrown when an event can't be applied yet (e.g. its customer isn't linked); the queue retries. */
export class RetryLater extends Error {}

/** Spec 10: Stripe subscriptions → Subscription and Entitlement records → the user's plan. */
@Injectable()
export class BillingService {
  private readonly logger = new Logger('Billing');

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(ENV) private readonly env: Env,
    @Inject(STRIPE_API) private stripe: StripeApi | null,
  ) {}

  /** Test seam: integration tests use a fake that records calls instead of reaching Stripe. */
  useStripeApi(api: StripeApi | null) {
    this.stripe = api;
  }

  private get db() {
    return this.prisma.client;
  }

  private priceId(tier: PriceTier, interval: BillingInterval): string | undefined {
    const e = this.env;
    if (tier === 'reduced')
      return interval === 'month'
        ? e.STRIPE_PRICE_PRO_MONTHLY_REDUCED
        : e.STRIPE_PRICE_PRO_YEARLY_REDUCED;
    return interval === 'month' ? e.STRIPE_PRICE_PRO_MONTHLY : e.STRIPE_PRICE_PRO_YEARLY;
  }

  private requireStripe(): StripeApi {
    if (!this.stripe)
      throw new ApiError(ErrorCode.SERVICE_UNAVAILABLE, 'Payments are not available right now.');
    return this.stripe;
  }

  // ---------------------------------------------------------------- entitlements

  /** The plan resolver used by EntitlementsService. */
  async planFor(userId: string, now = new Date()): Promise<Plan> {
    const e = await this.db.entitlement.findUnique({ where: { userId } });
    if (!e || e.plan !== 'pro') return 'free';
    return !e.validUntil || e.validUntil > now ? 'pro' : 'free';
  }

  /** Recomputes the user's entitlement from all their subscriptions. */
  async recompute(userId: string, now = new Date()): Promise<void> {
    const subs = await this.db.subscription.findMany({ where: { userId } });
    let plan: Plan = 'free';
    let validUntil: Date | null = null;
    let source: string | null = null;
    for (const s of subs) {
      if (ACTIVE.includes(s.status)) {
        plan = 'pro';
        validUntil = null;
        source = s.stripeSubscriptionId;
        break;
      }
      if (GRACE.includes(s.status) && s.graceUntil && s.graceUntil > now) {
        if (!validUntil || s.graceUntil > validUntil) {
          plan = 'pro';
          validUntil = s.graceUntil;
          source = s.stripeSubscriptionId;
        }
      }
    }
    const before = await this.db.entitlement.findUnique({ where: { userId } });
    await this.db.entitlement.upsert({
      where: { userId },
      create: { userId, plan, validUntil, source },
      update: { plan, validUntil, source },
    });
    if (before?.plan !== plan) {
      await this.audit.log({
        actorId: null,
        action: 'billing.plan_changed',
        target: userId,
        meta: { from: before?.plan ?? 'free', to: plan },
      });
    }
  }

  // ---------------------------------------------------------------- webhooks

  private async userForCustomer(customer: unknown, metadataUserId?: string | null) {
    if (metadataUserId) {
      const u = await this.db.user.findUnique({
        where: { id: metadataUserId },
        select: { id: true },
      });
      if (u) return u.id;
    }
    const id = typeof customer === 'string' ? customer : (customer as { id?: string } | null)?.id;
    if (!id) return null;
    const link = await this.db.billingCustomer.findUnique({ where: { stripeCustomerId: id } });
    return link?.userId ?? null;
  }

  /**
   * Applies one Stripe event. Idempotent: replaying an event changes nothing. Out-of-order safe:
   * a subscription or invoice event older than the last one applied is ignored.
   * Returns false when the event type is not one we act on.
   */
  async handleEvent(event: Stripe.Event): Promise<boolean> {
    switch (event.type) {
      case 'checkout.session.completed':
        await this.onCheckoutCompleted(event.data.object);
        return true;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.onSubscription(event.data.object, event.created, event.type.endsWith('deleted'));
        return true;
      case 'invoice.paid':
      case 'invoice.payment_failed':
        await this.onInvoice(event.data.object, event.created, event.type === 'invoice.paid');
        return true;
      default:
        return false;
    }
  }

  private async onCheckoutCompleted(session: Stripe.Checkout.Session) {
    const userId = session.client_reference_id ?? session.metadata?.userId ?? null;
    const customer =
      typeof session.customer === 'string' ? session.customer : (session.customer?.id ?? null);
    if (!userId || !customer) return;
    const user = await this.db.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) return;
    await this.db.billingCustomer.upsert({
      where: { userId },
      create: { userId, stripeCustomerId: customer },
      update: {},
    });
  }

  private async onSubscription(sub: Stripe.Subscription, created: number, deleted: boolean) {
    const userId = await this.userForCustomer(sub.customer, sub.metadata?.userId);
    if (!userId) throw new RetryLater(`no user for subscription ${sub.id} yet`);
    const existing = await this.db.subscription.findUnique({
      where: { stripeSubscriptionId: sub.id },
    });
    if (existing && created < existing.lastEventAt) return; // stale (out of order)
    const item = sub.items?.data?.[0];
    const data = {
      userId,
      status: deleted ? 'canceled' : sub.status,
      priceId: item?.price?.id ?? null,
      interval: item?.price?.recurring?.interval ?? null,
      currency: item?.price?.currency ?? sub.currency ?? null,
      currentPeriodEnd: item?.current_period_end ? new Date(item.current_period_end * 1000) : null,
      cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
      lastEventAt: created,
      // A subscription that is active again has paid: the grace period no longer applies.
      ...(ACTIVE.includes(sub.status) && !deleted ? { graceUntil: null } : {}),
      // past_due may arrive before invoice.payment_failed: start the grace period from either.
      ...(GRACE.includes(sub.status) && !deleted && !existing?.graceUntil
        ? { graceUntil: new Date((created + PAYMENT_GRACE_DAYS * 86_400) * 1000) }
        : {}),
    };
    await this.db.subscription.upsert({
      where: { stripeSubscriptionId: sub.id },
      create: { stripeSubscriptionId: sub.id, ...data },
      update: data,
    });
    await this.recompute(userId);
  }

  private async onInvoice(invoice: Stripe.Invoice, created: number, paid: boolean) {
    const ref = invoice.parent?.subscription_details?.subscription;
    const subId = typeof ref === 'string' ? ref : ref?.id;
    if (!subId) return; // one-off invoice, not a subscription payment
    const row = await this.db.subscription.findUnique({ where: { stripeSubscriptionId: subId } });
    if (!row) throw new RetryLater(`subscription ${subId} not known yet`);
    if (created < row.invoiceEventAt) return; // stale
    const graceUntil = paid
      ? null
      : (row.graceUntil ?? new Date((created + PAYMENT_GRACE_DAYS * 86_400) * 1000));
    await this.db.subscription.update({
      where: { id: row.id },
      data: { graceUntil, invoiceEventAt: created },
    });
    await this.recompute(row.userId);
  }

  // ---------------------------------------------------------------- user-facing

  prices(country: string | null): PriceList {
    const tier = priceTierFor(country);
    return {
      tier,
      prices: (['month', 'year'] as const).map((interval) => ({
        interval,
        ...PLAN_PRICES[tier][interval],
      })),
      available: Boolean(this.stripe && this.priceId(tier, 'month') && this.priceId(tier, 'year')),
    };
  }

  async status(user: User): Promise<BillingStatus> {
    const [plan, sub, customer] = await Promise.all([
      this.planFor(user.id),
      this.db.subscription.findFirst({
        where: { userId: user.id },
        orderBy: { updatedAt: 'desc' },
      }),
      this.db.billingCustomer.findUnique({ where: { userId: user.id } }),
    ]);
    return {
      plan,
      subscription: sub
        ? {
            status: sub.status,
            interval: sub.interval,
            currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
            cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
            graceUntil: sub.graceUntil?.toISOString() ?? null,
          }
        : null,
      hasCustomer: Boolean(customer),
    };
  }

  private async customerFor(user: User): Promise<string> {
    const existing = await this.db.billingCustomer.findUnique({ where: { userId: user.id } });
    if (existing) return existing.stripeCustomerId;
    const created = await this.requireStripe().customers.create({
      email: user.email,
      metadata: { userId: user.id },
    });
    try {
      await this.db.billingCustomer.create({
        data: { userId: user.id, stripeCustomerId: created.id },
      });
      return created.id;
    } catch (err) {
      // Two checkouts at once: keep the first customer.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')
        return (await this.db.billingCustomer.findUniqueOrThrow({ where: { userId: user.id } }))
          .stripeCustomerId;
      throw err;
    }
  }

  /** Stripe Checkout for Pro, with Stripe Tax and the user's regional price. */
  async checkout(user: User, interval: BillingInterval): Promise<{ url: string }> {
    const stripe = this.requireStripe();
    if ((await this.planFor(user.id)) === 'pro')
      throw new ApiError(ErrorCode.CONFLICT, 'You already have Forge Pro. Manage it in Settings.');
    const tier = priceTierFor(user.country);
    const price = this.priceId(tier, interval);
    if (!price)
      throw new ApiError(ErrorCode.SERVICE_UNAVAILABLE, 'This plan is not available yet.');
    const customer = await this.customerFor(user);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer,
      client_reference_id: user.id,
      line_items: [{ price, quantity: 1 }],
      subscription_data: { metadata: { userId: user.id } },
      metadata: { userId: user.id },
      automatic_tax: { enabled: true },
      customer_update: { address: 'auto', name: 'auto' },
      billing_address_collection: 'required',
      tax_id_collection: { enabled: true },
      allow_promotion_codes: true,
      success_url: `${this.env.WEB_ORIGIN}/settings?tab=billing&checkout=success`,
      cancel_url: `${this.env.WEB_ORIGIN}/pricing?checkout=cancelled`,
    });
    if (!session.url) throw new ApiError(ErrorCode.INTERNAL, 'Could not start checkout.');
    return { url: session.url };
  }

  /** Stripe Customer Portal: change plan, payment method, cancel. */
  async portal(user: User): Promise<{ url: string }> {
    const stripe = this.requireStripe();
    const link = await this.db.billingCustomer.findUnique({ where: { userId: user.id } });
    if (!link) throw ApiError.notFound('Billing account');
    const session = await stripe.billingPortal.sessions.create({
      customer: link.stripeCustomerId,
      return_url: `${this.env.WEB_ORIGIN}/settings?tab=billing`,
    });
    return { url: session.url };
  }

  async invoices(user: User): Promise<InvoiceList> {
    const link = await this.db.billingCustomer.findUnique({ where: { userId: user.id } });
    if (!link) return { items: [] };
    const list = await this.requireStripe().invoices.list({
      customer: link.stripeCustomerId,
      limit: 24,
    });
    return {
      items: list.data.map((i) => ({
        id: i.id ?? '',
        number: i.number ?? null,
        date: new Date(i.created * 1000).toISOString(),
        total: i.total,
        currency: i.currency,
        status: i.status ?? null,
        hostedUrl: i.hosted_invoice_url ?? null,
        pdfUrl: i.invoice_pdf ?? null,
      })),
    };
  }
}
