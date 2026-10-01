import { createHmac } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { signUpAndOnboard } from './helpers';

const FIXED = `def average_rating(ratings):
    rated = [r for r in ratings if r]
    return sum(rated) / len(rated) if rated else 0`;

async function noSeriousA11yIssues(page: Page) {
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  const serious = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);
}

test.describe('engagement', () => {
  test.beforeEach(async ({ page }) => {
    await signUpAndOnboard(page);
  });

  test('dashboard follows the goal and shows progress, daily and the placement prompt', async ({
    page,
  }) => {
    await page.goto('/dashboard');
    await expect(page.getByTestId('goal-intro')).toHaveText(
      'Pick up where you left off in your courses.',
    );
    const progress = page.getByTestId('progress-card');
    await expect(progress.getByText('Level 1')).toBeVisible();
    await expect(progress.getByTestId('streak')).toHaveText('0 day streak');
    await expect(page.getByTestId('daily-list').getByRole('listitem').first()).toBeVisible();
    await expect(page.getByTestId('placement-prompt')).toBeVisible();
    await noSeriousA11yIssues(page);

    // Daily page is public and links to today's problems.
    await page.goto('/daily');
    await expect(page.getByRole('heading', { name: 'Daily challenge' })).toBeVisible();
    await expect(page.getByText(/Challenges for \d{4}-\d{2}-\d{2} \(UTC\)/)).toBeVisible();
  });

  test('placement quiz sets a starting level once', async ({ page }) => {
    await page.goto('/onboarding/placement');
    const groups = page.getByRole('group');
    await expect(groups).toHaveCount(10);
    // Choose the first option everywhere: two of the ten are right.
    for (let i = 0; i < 10; i++) await groups.nth(i).getByRole('radio').first().check();
    await noSeriousA11yIssues(page);
    await page.getByRole('button', { name: 'See my starting level' }).click();
    const result = page.getByTestId('placement-result');
    await expect(result.getByText('2 of 10 correct')).toBeVisible();
    await expect(result).toContainText('strings');
    await page.getByRole('link', { name: 'Go to your dashboard' }).click();
    await expect(page.getByTestId('placement-prompt')).toHaveCount(0);
    await page.goto('/onboarding/placement');
    await expect(page.getByText("You've already taken the placement quiz.")).toBeVisible();
  });

  test('solving a problem earns XP and starts a streak', async ({ page }) => {
    await page.goto('/problems/fix-average-rating/solve');
    await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 60_000 });
    await page.evaluate((c) => window.monaco!.editor.getModels()[0]!.setValue(c), FIXED);
    await page.keyboard.press('Control+Shift+Enter');
    await expect(page.getByText(/Submission · \d+\/\d+ tests passed/)).toBeVisible({
      timeout: 60_000,
    });
    await page.goto('/dashboard');
    const progress = page.getByTestId('progress-card');
    await expect(progress.getByTestId('streak')).toHaveText('1 day streak');
    // Easy solve: 10 XP (20 if it happens to be today's daily challenge).
    await expect(progress.getByText(/^(10|20) XP$/)).toBeVisible();
  });

  test('weekly email: opt in from settings, unsubscribe in one click', async ({ page }) => {
    await page.goto('/settings');
    await page.getByLabel(/Send me a weekly progress email/).check();
    await page.getByRole('button', { name: 'Save' }).first().click();
    await expect(page.getByText(/saved/i).first()).toBeVisible();

    const me = (await (await page.request.get('/api/v1/me')).json()) as { id: string };
    const sig = createHmac('sha256', process.env.APP_SECRET!)
      .update(`digest-unsubscribe:${me.id}`)
      .digest('base64url');
    // Signed out: the link alone is enough.
    await page.context().clearCookies();
    await page.goto(`/unsubscribe?token=${me.id}.${sig}`);
    await page.getByRole('button', { name: 'Unsubscribe' }).click();
    await expect(
      page.getByText("You're unsubscribed from the weekly progress email."),
    ).toBeVisible();
  });
});
