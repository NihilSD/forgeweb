import { createHmac } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { E2E_STRIPE_WEBHOOK_SECRET } from '../playwright.config';
import { signUpAndOnboard } from './helpers';

/** Posts a webhook signed the way Stripe signs them (t=…,v1=HMAC-SHA256 of "t.payload"). */
async function stripeWebhook(page: Page, type: string, object: Record<string, unknown>) {
  const payload = JSON.stringify({
    id: `evt_e2e_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    object: 'event',
    type,
    created: Math.floor(Date.now() / 1000),
    data: { object },
  });
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', E2E_STRIPE_WEBHOOK_SECRET)
    .update(`${t}.${payload}`)
    .digest('hex');
  const res = await page.request.post('http://localhost:4000/api/v1/billing/webhook', {
    headers: { 'content-type': 'application/json', 'stripe-signature': `t=${t},v1=${v1}` },
    data: payload,
  });
  expect(res.status()).toBe(200);
}

test('pricing, upgrade prompt, and Pro unlocking after a Stripe subscription', async ({ page }) => {
  await signUpAndOnboard(page);

  await page.goto('/pricing');
  const pro = page.getByTestId('pro-plan');
  await expect(pro.getByText('€12.00')).toBeVisible();
  await expect(pro.getByText(/€99\.00 per year/)).toBeVisible();
  // No Stripe keys in e2e: checkout buttons stay disabled, the API decides.
  await expect(pro.getByRole('button', { name: 'Upgrade monthly' })).toBeDisabled();
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual(
    [],
  );

  // Locked for Free, with an upgrade prompt.
  await page.goto('/review');
  await expect(page.getByRole('link', { name: 'See Pro' })).toBeVisible();
  await page.goto('/settings?tab=billing');
  await expect(page.getByTestId('billing-plan')).toHaveText('Forge Free');

  // Stripe tells us the subscription is active.
  const me = (await (await page.request.get('/api/v1/me')).json()) as { id: string };
  await stripeWebhook(page, 'customer.subscription.created', {
    id: `sub_e2e_${me.id.slice(0, 8)}`,
    object: 'subscription',
    customer: `cus_e2e_${me.id.slice(0, 8)}`,
    status: 'active',
    cancel_at_period_end: false,
    metadata: { userId: me.id },
    items: {
      data: [
        {
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 86_400,
          price: { id: 'price_e2e', currency: 'eur', recurring: { interval: 'month' } },
        },
      ],
    },
  });

  await expect(async () => {
    await page.goto('/settings?tab=billing');
    await expect(page.getByTestId('billing-plan')).toHaveText('Forge Pro', { timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await expect(page.getByText('Renews on')).toBeVisible();

  await page.goto('/review');
  await expect(page.getByRole('heading', { name: /review/i }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'See Pro' })).toHaveCount(0);
  await page.goto('/pricing');
  await expect(page.getByRole('link', { name: /You have Pro/ })).toBeVisible();
});
