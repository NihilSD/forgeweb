import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test('browse, filter and open a problem', async ({ page }) => {
  await page.goto('/problems');
  await expect(page.getByRole('heading', { name: 'Problems', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Matching Orders' })).toBeVisible();

  await page.getByLabel('Track').selectOption('sql');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page).toHaveURL(/track=sql/);
  await expect(page.getByRole('link', { name: 'Top Customers in a City' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Matching Orders' })).toHaveCount(0);

  await page.getByRole('link', { name: 'Top Customers in a City' }).click();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Top Customers in a City' }),
  ).toBeVisible();
  await expect(page.getByText('HAVING')).toHaveCount(0);
  await expect(page.locator('article')).not.toContainText('{{');
});

test('search with no results shows an empty state with one action', async ({ page }) => {
  await page.goto('/problems?q=zzzznotaproblem');
  await expect(page.getByText('No problems match these filters')).toBeVisible();
  await page.getByRole('link', { name: 'Clear filters' }).click();
  await expect(page.getByRole('link', { name: 'Matching Orders' })).toBeVisible();
});

test('library and problem pages have no serious accessibility violations', async ({ page }) => {
  for (const path of ['/problems', '/problems/two-sum-orders']) {
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
      .analyze();
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(
      serious,
      `${path}: ${JSON.stringify(serious.map((v) => [v.id, v.nodes[0]?.target]))}`,
    ).toEqual([]);
  }
});
