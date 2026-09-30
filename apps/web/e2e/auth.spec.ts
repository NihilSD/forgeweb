import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { linkFrom, PASSWORD, signUpAndOnboard, uniqueEmail, waitForEmail } from './helpers';

test('sign up, verify, onboard, sign out and sign in again', async ({ page }) => {
  const { email } = await signUpAndOnboard(page);
  await expect(page.getByRole('heading', { name: /Welcome back, E2E User/ })).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL('/');
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('shows a clear error for a wrong password', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('nobody@example.com');
  await page.getByLabel('Password').fill('not-the-password');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Email or password is incorrect')).toBeVisible();
});

test('blocks under-16 users at onboarding', async ({ page }) => {
  await page.goto('/signup');
  await page.getByLabel('Email').fill(uniqueEmail('young'));
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByLabel('Handle').fill(`young${Date.now().toString(36)}`);
  await page.getByLabel('Display name').fill('Young');
  await page.getByLabel('Birth year').fill(String(new Date().getFullYear() - 13));
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText(/aged 16 and over\. We/)).toBeVisible();
  await expect(page).toHaveURL(/\/onboarding$/);
});

test('password reset by email', async ({ page }) => {
  const { email } = await signUpAndOnboard(page);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.goto('/forgot-password');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send reset link' }).click();
  await expect(page.getByText('reset link is on its way')).toBeVisible();
  const text = await waitForEmail(email, /reset/i);
  await page.goto(linkFrom(text, 'reset-password'));
  await page.getByLabel('New password').fill('e2e-a-brand-new-password-1');
  await page.getByRole('button', { name: 'Change password' }).click();
  await expect(page.getByText('Your password was changed')).toBeVisible();
});

test('auth pages have no serious accessibility violations', async ({ page }) => {
  for (const path of ['/login', '/signup', '/forgot-password']) {
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
      .analyze();
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(serious, `${path}: ${JSON.stringify(serious.map((v) => v.id))}`).toEqual([]);
  }
});
