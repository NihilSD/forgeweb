# Stripe setup (test mode first)

Everything below is done by hand in the Stripe Dashboard. Do it in **test mode** first; repeat in
live mode at launch (phase L13). Never commit any key: put them in the environment (`.env` locally,
the secret store in deployment). Variable names are in `.env.example`.

## 1. Account and tax

1. Create the Stripe account and complete the business profile (legal entity, address, bank
   account for payouts). Test mode works before verification is finished.
2. **Tax → Get started (Stripe Tax)**: set the head office address, the default product tax code
   _Software as a service (SaaS) – electronically supplied services_ and **tax behaviour:
   inclusive** (EU consumer prices include VAT). Add your EU VAT registration (OSS) when you have
   it; Stripe Tax shows when you cross thresholds elsewhere.
3. **Settings → Customer emails**: turn on emails for successful payments and refunds, and invoice
   emails if you want Stripe to email invoices too (the app also lists them in Settings → Billing).

## 2. Product and prices

Create one product, **Forge Pro**, with four recurring prices. Amounts must match
`packages/shared/src/plans.ts` (`PLAN_PRICES`):

| Price                  | Amount | Interval | Env variable                       |
| ---------------------- | ------ | -------- | ---------------------------------- |
| Pro monthly            | €12.00 | month    | `STRIPE_PRICE_PRO_MONTHLY`         |
| Pro yearly             | €99.00 | year     | `STRIPE_PRICE_PRO_YEARLY`          |
| Pro monthly (regional) | €6.00  | month    | `STRIPE_PRICE_PRO_MONTHLY_REDUCED` |
| Pro yearly (regional)  | €49.00 | year     | `STRIPE_PRICE_PRO_YEARLY_REDUCED`  |

Set **Include tax in price: yes** on each. Copy each price id (`price_…`) into the environment. The
regional prices are used for the countries in `REDUCED_PRICE_COUNTRIES` (profile country).

## 3. API key

**Developers → API keys**: create a **restricted key** with write access to Customers, Checkout
Sessions, Customer Portal sessions and Subscriptions, and read access to Invoices and Prices.
Put it in `STRIPE_SECRET_KEY`. (A full secret key also works, but the restricted key limits damage
if it ever leaks.)

## 4. Customer Portal

**Settings → Billing → Customer portal**:

- Allow: update payment method, view invoice history, update billing address and tax id,
  **cancel subscriptions (at end of billing period)**, switch between Pro monthly and yearly (add
  both standard prices, and both regional prices, as products customers can switch to).
- Business information: link the Terms and Privacy pages (`/legal/terms`, `/legal/privacy`).
- Default return URL: `https://<web origin>/settings?tab=billing`.

## 5. Failed payments (7-day grace)

**Settings → Billing → Subscriptions and emails → Manage failed payments**: Smart Retries over **up
to 1 week**, then **cancel the subscription**. Forge keeps Pro for 7 days after the first failed
payment (`PAYMENT_GRACE_DAYS`), whatever the retry schedule. Turn on the emails asking customers to
update their card.

## 6. Webhook endpoint

**Developers → Webhooks → Add endpoint**: `https://<api origin>/api/v1/billing/webhook`, with these
events:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

Copy the **signing secret** (`whsec_…`) into `STRIPE_WEBHOOK_SECRET`. The API rejects anything not
signed with it, stores each event once, and processes it through the `billing-webhooks` queue.
Events can arrive twice or out of order; both are handled.

For local development, use the Stripe CLI instead of a public endpoint:

```
stripe listen --forward-to localhost:4000/api/v1/billing/webhook
```

and put the `whsec_…` it prints into `.env`.

## 7. Check it end to end (test mode)

1. Sign up, verify the email, open **Pricing → Upgrade monthly**.
2. Pay with card `4242 4242 4242 4242`, any future date, any CVC.
3. You land on **Settings → Billing** and the plan shows **Forge Pro** within seconds.
4. **Manage subscription and payment** opens the portal. Cancel: the plan stays Pro until the period
   ends. In the Dashboard, _Cancel immediately_ drops it to Free.
5. Card `4000 0000 0000 0341` (attaches but fails on charge) tests the failed payment flow: Settings
   shows the grace message and Pro stays for 7 days.

## 8. Live mode (L13)

Repeat steps 2–6 in live mode (prices and webhooks are separate per mode), switch the environment
to the live key, price ids and webhook secret, and activate Stripe Tax registrations.
