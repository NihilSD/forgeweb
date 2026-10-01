# 0010 — Billing and Pro (phase L10)

Date: 2026-10-01 · Status: accepted

Manual Stripe Dashboard steps are in [docs/runbooks/stripe.md](../runbooks/stripe.md).

## Enforcement

- Limits live only in `packages/shared/src/plans.ts`. Only `EntitlementsService` decides access, and
  every gated endpoint calls it: hints, editorials, review queue, lessons after the first three,
  verified starts. Study plans arrive later and will use the existing `study_plans` feature.
- The plan comes from `BillingService.planFor`, installed as the entitlements plan resolver. It reads
  the user's `Entitlement` row, which is **recomputed from their subscriptions after every webhook**:
  - `active`/`trialing` → Pro with no end date;
  - `past_due`/`unpaid` → Pro until `graceUntil` (7 days after the first failed payment, from
    whichever of `invoice.payment_failed` or `subscription.updated(past_due)` arrives first);
  - anything else → Free.
    Because the grace end is stored as `validUntil`, Pro lapses on time even if no further webhook
    arrives.
- The web app only reads `/me/entitlements` and `/billing/status` to show locks. Tests call each
  Pro endpoint directly as a Free user (402/403) and as a Pro user made Pro through a real signed
  webhook.

## Stripe integration

- SDK `stripe@23.0.0` (current stable, API version `2026-09-30.endive`). It was published within
  pnpm's minimum-release-age window, so it is listed in `minimumReleaseAgeExclude`. The code follows
  that API version: period end is on the subscription item, and an invoice's subscription is under
  `parent.subscription_details`.
- The API talks to Stripe through a narrow `StripeApi` interface (customers, checkout sessions,
  portal sessions, invoices). Without `STRIPE_SECRET_KEY` it is `null` and billing endpoints answer
  `503 SERVICE_UNAVAILABLE`, so local development and CI need no Stripe account.
- **Checkout**: subscription mode, the user's regional price, `automatic_tax`, required billing
  address, tax-id collection, promotion codes. `client_reference_id`, the session metadata and the
  subscription metadata carry the user id, so any event can be matched to the user. One Stripe
  customer per user, created on first checkout (race-safe).
- **Portal**: Stripe's Customer Portal handles plan switches, payment methods and cancellation.
- **Invoices**: listed live from Stripe in Settings → Billing (number, date, total in minor units,
  status, PDF link).
- **Regional pricing**: two tiers (`standard`, `reduced` 50% for Romania and similar markets), chosen
  from the profile country. Display prices come from `PLAN_PRICES` and must match the Stripe prices.

## Webhooks

1. `POST /api/v1/billing/webhook` takes the raw body, verifies `Stripe-Signature` with
   `STRIPE_WEBHOOK_SECRET` (no session, no CSRF), stores the event in `WebhookEvent` (unique event
   id), enqueues it with `jobId = event id`, and returns 200 at once. A duplicate delivery returns
   `duplicate: true` and is not applied again.
2. A BullMQ worker (`billing-webhooks`, 8 attempts, exponential backoff) applies it:
   - **Idempotent**: a processed event is skipped. Re-applying the same state is harmless.
   - **Out of order**: each subscription stores the `created` time of the last subscription event
     and of the last invoice event applied. Older events are ignored, so a late "active" can't
     resurrect a cancelled subscription and a late "payment failed" can't undo a later payment.
   - **Not linkable yet** (a subscription event before its checkout, without metadata): throws
     `RetryLater`, so the queue retries until the customer link exists.
   - Unknown event types are recorded as `ignored`.
3. Plan changes are audit-logged (`billing.plan_changed`).

Tests sign real Stripe test webhooks with the SDK's own test helper and cover: bad and missing
signatures, checkout linking, every handled event type, duplicates, out-of-order subscription and
invoice events, the retry path, the 7-day grace (Pro at day 6, Free at day 8), cancel at period end
and deletion.
