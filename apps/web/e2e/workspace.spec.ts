import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { signUpAndOnboard } from './helpers';

const BUGGY = `def average_rating(ratings):
    rated = [r for r in ratings[1:] if r]
    return sum(rated) / len(rated) if rated else 0`;
const FIXED = `def average_rating(ratings):
    rated = [r for r in ratings if r]
    return sum(rated) / len(rated) if rated else 0`;

async function openWorkspace(page: Page, slug: string) {
  await page.goto(`/problems/${slug}/solve`);
  await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 60_000 });
}

/** Sets editor content through Monaco's model: typing would trigger auto-indent and brackets. */
async function setCode(page: Page, code: string) {
  await page.evaluate((c) => window.monaco!.editor.getModels()[0]!.setValue(c), code);
}

async function editorValue(page: Page) {
  return page.evaluate(() => window.monaco!.editor.getModels()[0]!.getValue());
}

test.describe('workspace', () => {
  test.beforeEach(async ({ page }) => {
    await signUpAndOnboard(page);
  });

  test('write, run, fail, fix, submit, Accepted', async ({ page }) => {
    await openWorkspace(page, 'fix-average-rating');
    await expect(page.getByRole('heading', { name: 'Fix the Average Rating' })).toBeVisible();

    await setCode(page, BUGGY);
    await page.getByRole('button', { name: 'Run' }).click();
    await expect(page.getByTestId('verdict')).toHaveText('Wrong Answer', { timeout: 60_000 });
    await expect(page.getByText('expected:').first()).toBeVisible();

    await setCode(page, FIXED);
    await page.getByRole('button', { name: 'Run' }).click();
    await expect(page.getByTestId('verdict')).toHaveText('Accepted', { timeout: 60_000 });

    await page.keyboard.press('Control+Shift+Enter');
    await expect(page.getByText(/Submission · \d+\/\d+ tests passed/)).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByTestId('verdict')).toHaveText('Accepted');
    await expect(page.getByText('Solved', { exact: true })).toBeVisible();

    await page.getByRole('tab', { name: 'Submissions' }).click();
    await expect(
      page.getByRole('list', { name: 'Your runs and submissions' }).getByRole('listitem'),
    ).toHaveCount(3);
  });

  test('custom input shows what the function returned', async ({ page }) => {
    await openWorkspace(page, 'fix-average-rating');
    await setCode(page, FIXED);
    await page.getByRole('tab', { name: 'Custom input' }).click();
    await page.getByLabel('Arguments as a JSON array').fill('[[2, 4, 0]]');
    await page.getByRole('button', { name: 'Run' }).click();
    await expect(page.getByTestId('custom-output')).toHaveText('3', { timeout: 60_000 });
  });

  test('drafts survive a reload', async ({ page }) => {
    await openWorkspace(page, 'two-sum-orders');
    await setCode(page, 'def match_orders(amounts, target):\n    return "draft-marker"\n');
    await expect(page.getByTestId('save-state')).toHaveText('Draft saved', { timeout: 10_000 });
    await page.reload();
    await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 60_000 });
    expect(await editorValue(page)).toContain('draft-marker');
  });

  test('SQL workspace shows the schema and result rows', async ({ page }) => {
    await openWorkspace(page, 'city-top-customers');
    await expect(page.getByRole('heading', { name: 'Schema' })).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'Schema' }).getByText('customer_id'),
    ).toBeVisible();
    await setCode(page, 'SELECT name, 0 AS total FROM customers;');
    await page.getByRole('button', { name: 'Run' }).click();
    await expect(page.getByTestId('verdict')).toHaveText('Wrong Answer', { timeout: 60_000 });
    await expect(page.getByRole('table', { name: 'Your rows' })).toBeVisible();
  });

  test('flag challenge: download files and submit the flag', async ({ page }) => {
    await page.goto('/problems/caesar-intercept/solve');
    const link = page.getByRole('link', { name: 'intercept.txt' });
    await expect(link).toBeVisible();
    const text = await (await page.request.get((await link.getAttribute('href'))!)).text();
    let flag = '';
    for (let k = 0; k < 26 && !flag; k++) {
      const plain = text.replace(/[a-z]/gi, (c) => {
        const b = c <= 'Z' ? 65 : 97;
        return String.fromCharCode(((c.charCodeAt(0) - b - k + 26) % 26) + b);
      });
      flag = /FORGE\{[0-9a-f]{24}\}/.exec(plain)?.[0] ?? '';
    }
    await page.getByLabel('Flag').fill(flag);
    await page.getByRole('button', { name: 'Submit flag' }).click();
    await expect(page.getByText('Correct flag. Well done!')).toBeVisible();
  });

  test('workspace has no serious accessibility violations', async ({ page }) => {
    await openWorkspace(page, 'two-sum-orders');
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag22aa'])
      .analyze();
    const serious = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );
    expect(
      serious,
      JSON.stringify(serious.map((v) => [v.id, v.nodes.slice(0, 3).map((n) => n.target)])),
    ).toEqual([]);
  });
});
