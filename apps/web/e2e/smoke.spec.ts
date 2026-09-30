import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('smoke', () => {
  for (const theme of ['dark', 'light'] as const) {
    test(`home page loads in ${theme} theme`, async ({ page, context }) => {
      await context.addCookies([
        { name: 'forge_theme', value: theme, url: 'http://localhost:3000' },
      ]);
      await page.goto('/');
      await expect(page.getByRole('heading', { level: 1 })).toContainText('prove them fairly');
      await expect(page.getByTestId('api-status')).toHaveText('Operational');
      const html = page.locator('html');
      if (theme === 'dark') await expect(html).toHaveClass(/dark/);
      else await expect(html).not.toHaveClass(/dark/);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
        .analyze();
      const serious = results.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      );
      expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
    });
  }

  test('theme toggle switches and persists', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.getByTestId('theme-toggle').click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
    await page.reload();
    await expect(page.locator('html')).not.toHaveClass(/dark/);
  });

  test('sends a CSP with a nonce', async ({ page }) => {
    const res = await page.goto('/');
    const csp = res?.headers()['content-security-policy'] ?? '';
    expect(csp).toMatch(/script-src 'self' 'nonce-/);
    expect(csp).toContain("frame-ancestors 'none'");
  });
});
