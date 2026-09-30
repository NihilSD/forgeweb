import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { signUpAndOnboard } from './helpers';

async function setFirstEditor(page: Page, code: string) {
  await expect(page.locator('.monaco-editor').first()).toBeVisible({ timeout: 60_000 });
  await page.evaluate((c) => window.monaco!.editor.getModels()[0]!.setValue(c), code);
}

test('complete a lesson, use a hint, solve, and see mastery change', async ({ page }) => {
  await signUpAndOnboard(page);

  // Lesson with an embedded exercise.
  await page.goto('/learn/python-basics');
  await page.getByRole('link', { name: 'Start the course' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(
    'Numbers, variables and loops',
  );
  await expect(page.getByRole('button', { name: 'Mark lesson complete' })).toBeDisabled();
  await setFirstEditor(
    page,
    'def sum_positives(numbers):\n    return sum(n for n in numbers if n > 0)\n',
  );
  await page.getByTestId('lesson-exercise').getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByTestId('verdict')).toHaveText('Accepted', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Mark lesson complete' }).click();
  await expect(page.getByTestId('lesson-completed')).toBeVisible();

  // Mastery before.
  await page.goto('/skills');
  await expect(page.getByTestId('mastery-hashing')).toHaveText('Level 0 · 0 pts');

  // Use a hint, then solve.
  await page.goto('/problems/two-sum-orders/solve');
  await page.getByRole('tab', { name: 'Hints' }).click();
  await page.getByRole('button', { name: /Show hint 1/ }).click();
  await expect(page.getByTestId('hint-1')).toContainText(/target - amount/);
  await setFirstEditor(
    page,
    'def match_orders(amounts, target):\n    seen = {}\n    for j, a in enumerate(amounts):\n        if target - a in seen:\n            return [seen[target - a], j]\n        seen[a] = j\n',
  );
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByTestId('verdict')).toHaveText('Accepted', { timeout: 60_000 });

  // Mastery after: one easy solve with one hint = 10 × 0.75 ≈ 8 points.
  await page.goto('/skills');
  await expect(page.getByTestId('mastery-hashing')).toHaveText('Level 0 · 8 pts');
  await expect(page.getByTestId('mastery-arrays')).not.toHaveText('Level 0 · 0 pts');
});

test('free users hit the hint limit and see the Pro prompt; editorial is locked', async ({
  page,
}) => {
  await signUpAndOnboard(page);
  await page.goto('/problems/budget-window/solve');
  await page.getByRole('tab', { name: 'Hints' }).click();
  for (const n of [1, 2, 3])
    await page.getByRole('button', { name: new RegExp(`Show hint ${n}`) }).click();
  await page.getByRole('button', { name: /Show hint 4/ }).click();
  await expect(page.getByText(/used today's free hints/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'See Pro' })).toBeVisible();

  await page.getByRole('tab', { name: 'Editorial' }).click();
  await expect(
    page.getByText('The editorial unlocks when you solve the problem or give up.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Give up…' }).click();
  await page.getByRole('button', { name: 'Give up', exact: true }).click();
  await expect(page.getByText(/Editorials are part of Forge Pro/)).toBeVisible();
});

test('learn, lesson and skills pages have no serious accessibility violations', async ({
  page,
}) => {
  await signUpAndOnboard(page);
  for (const path of [
    '/learn',
    '/learn/core-patterns/two-pointers',
    '/skills',
    '/review',
    '/pricing',
  ]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
      .analyze();
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(
      serious,
      `${path}: ${JSON.stringify(serious.map((v) => [v.id, v.nodes.slice(0, 2).map((n) => n.target)]))}`,
    ).toEqual([]);
  }
});

test('visualizer steps through the algorithm', async ({ page }) => {
  await page.goto('/learn/core-patterns/two-pointers');
  const viz = page.getByRole('figure', { name: 'two-pointers visualization' });
  await expect(viz.getByText(/Step 1 of/)).toBeVisible();
  await viz.getByRole('button', { name: 'Next step' }).click();
  await expect(viz.getByText(/Step 2 of/)).toBeVisible();
});
