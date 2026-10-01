/** Phase L12: keyboard-only use, accessibility on every public page, XSS in user fields. */
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { PASSWORD, signUpAndOnboard } from './helpers';

async function serious(page: Page) {
  const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  return r.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

const PUBLIC = [
  '/',
  '/problems',
  '/problems/two-sum-orders',
  '/learn',
  '/daily',
  '/pricing',
  '/security/rules',
  '/legal/privacy',
  '/legal/terms',
  '/legal/cookies',
  '/legal/acceptable-use',
  '/login',
  '/signup',
  '/forgot-password',
];

for (const theme of ['dark', 'light'] as const) {
  test(`public pages have no serious accessibility violations (${theme})`, async ({
    page,
    context,
  }) => {
    await context.addCookies([{ name: 'forge_theme', value: theme, url: 'http://localhost:3000' }]);
    const failures: string[] = [];
    for (const path of PUBLIC) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBeLessThan(400);
      for (const v of await serious(page)) failures.push(`${path} ${v}`);
    }
    expect(failures).toEqual([]);
  });
}

test('signs in with the keyboard only, with a visible focus ring', async ({ page }) => {
  const { email } = await signUpAndOnboard(page);
  await page.context().clearCookies();
  await page.goto('/login');
  // Tab from the top of the page until the email field has focus.
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('Tab');
    if (await page.getByLabel('Email').evaluate((el) => el === document.activeElement)) break;
  }
  await expect(page.getByLabel('Email')).toBeFocused();
  await page.keyboard.type(email);
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Password')).toBeFocused();
  await page.keyboard.type(PASSWORD);
  await page.keyboard.press('Tab');
  // Whatever has focus now shows a visible outline.
  const outline = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement;
    const s = getComputedStyle(el);
    return `${s.outlineStyle} ${s.outlineWidth} ${s.boxShadow}`;
  });
  expect(outline).not.toMatch(/^none 0px none$/);
  await page.getByLabel('Password').press('Enter');
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('HTML in a display name is shown as text, never run', async ({ page }) => {
  await signUpAndOnboard(page);
  await page.goto('/settings');
  const payload = '<img src=x onerror="window.__pwned=1">';
  await page.getByLabel('Display name').fill(payload);
  await page.getByRole('button', { name: 'Save' }).first().click();
  await expect(page.getByText('Profile saved.')).toBeVisible();
  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(payload);
  expect(
    await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned),
  ).toBeUndefined();
  expect(await page.locator('img[src="x"]').count()).toBe(0);
});
