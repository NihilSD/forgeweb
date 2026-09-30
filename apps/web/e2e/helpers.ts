import { expect, type Page } from '@playwright/test';
import { MAILPIT_URL } from './global-setup';

export const PASSWORD = 'e2e-correct-horse-battery-7';

export function uniqueEmail(prefix = 'e2e') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
}

/** Waits for the newest email to `to` in Mailpit and returns its text body. */
export async function waitForEmail(to: string, subject: RegExp): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(
      `${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`,
    );
    const body = (await res.json()) as { messages: { ID: string; Subject: string }[] };
    const msg = body.messages.find((m) => subject.test(m.Subject));
    if (msg) {
      const full = (await (await fetch(`${MAILPIT_URL}/api/v1/message/${msg.ID}`)).json()) as {
        Text: string;
      };
      return full.Text;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`No email to ${to} matching ${subject}`);
}

export function linkFrom(text: string, path: string): string {
  const m = new RegExp(`https?://[^\\s]+/${path}\\?token=[A-Za-z0-9_-]+`).exec(text);
  if (!m) throw new Error(`no ${path} link in:\n${text}`);
  return new URL(m[0]).pathname + new URL(m[0]).search;
}

/** Signs up, verifies the email and completes onboarding. Leaves the user on the dashboard. */
export async function signUpAndOnboard(page: Page, opts: { email?: string; handle?: string } = {}) {
  const email = opts.email ?? uniqueEmail();
  await page.goto('/signup');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/onboarding$/);

  const text = await waitForEmail(email, /verify/i);
  await page.goto(linkFrom(text, 'verify-email'));
  await expect(page.getByText('Your email is verified')).toBeVisible();

  await page.goto('/onboarding');
  await page.getByLabel('Handle').fill(opts.handle ?? `u${Date.now().toString(36)}`);
  await page.getByLabel('Display name').fill('E2E User');
  await page.getByLabel('Birth year').fill('1994');
  await page.getByLabel('Time zone').fill('Europe/Bucharest');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return { email };
}
