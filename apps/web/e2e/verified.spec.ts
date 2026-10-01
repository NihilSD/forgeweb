import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { signUpAndOnboard } from './helpers';

const SOLUTION = [
  'def match_orders(amounts, target):',
  '    seen = {}',
  '    for j, amount in enumerate(amounts):',
  '        need = target - amount',
  '        if need in seen:',
  '            return [seen[need], j]',
  '        seen[amount] = j',
  '    return []',
  '',
].join('\n');

/** Same algorithm as SOLUTION, to answer "what does your function return" questions. */
function matchOrders(amounts: number[], target: number): number[] {
  const seen = new Map<number, number>();
  for (const [j, amount] of amounts.entries()) {
    const i = seen.get(target - amount);
    if (i !== undefined) return [i, j];
    seen.set(amount, j);
  }
  return [];
}

/** Types the solution in small chunks through Monaco's model (typing keys would auto-indent). */
async function typeSolution(page: Page) {
  await page.evaluate((code) => {
    const m = window.monaco!;
    const model = m.editor.getModels()[0]!;
    model.setValue('');
    for (let i = 0; i < code.length; i += 8) {
      const end = model.getFullModelRange().getEndPosition();
      model.applyEdits([
        {
          range: new m.Range(end.lineNumber, end.column, end.lineNumber, end.column),
          text: code.slice(i, i + 8),
        },
      ]);
    }
  }, SOLUTION);
}

async function answerFollowUps(page: Page) {
  for (let n = 1; n <= 3; n++) {
    const q = page.getByTestId('follow-up');
    const done = page.getByTestId('attempt-result');
    await expect(q.or(done)).toBeVisible({ timeout: 30_000 });
    if (await done.isVisible()) return;
    await expect(q.getByText(`Question ${n} of`)).toBeVisible();
    const kind = await q.getAttribute('data-kind');
    const prompt = (await q.locator('p.font-medium').textContent()) ?? '';
    if (kind === 'predict') {
      const m = /amounts = (\[[^\]]*\]) and target = (\d+)/.exec(prompt)!;
      const answer = JSON.stringify(matchOrders(JSON.parse(m[1]!) as number[], Number(m[2])));
      await q.getByLabel('Your answer').fill(answer);
    } else if (kind === 'edge-case') {
      await q.getByLabel('Yes').check();
    } else if (kind === 'explain') {
      await q.getByLabel('A hash map / dictionary of seen amounts').check();
    } else {
      // Change question: pick the line where the target is used.
      await q.getByRole('button', { name: /need = target - amount/ }).click();
      await expect(q.getByLabel('Line number')).toHaveValue('4');
    }
    await q.getByRole('button', { name: 'Answer' }).click();
  }
}

test('verified attempt: consent, timed workspace, follow-ups, verified badge, replay', async ({
  page,
}) => {
  await signUpAndOnboard(page);
  await page.goto('/verified');
  await expect(page.getByText('3 of 3 free starts left this week.')).toBeVisible();
  await page.getByRole('link', { name: 'Matching Orders' }).click();

  // Consent screen lists what is recorded; nothing starts without agreeing.
  await expect(page.getByRole('heading', { name: 'What we record' })).toBeVisible();
  await expect(page.getByText('No webcam, microphone or screen recording.')).toBeVisible();
  const start = page.getByRole('button', { name: 'Start the attempt' });
  await expect(start).toBeDisabled();
  await page.getByLabel('I understand what is recorded and agree to it for this attempt.').check();
  await start.click();

  await expect(page).toHaveURL(/\/attempts\/[0-9a-f-]+$/);
  await expect(page.getByTestId('attempt-workspace')).toBeVisible();
  await expect(page.getByRole('timer')).toHaveAccessibleName(/Time left (29|30):\d\d/);
  await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 60_000 });
  // No practice help in verified mode.
  await expect(page.getByRole('tab', { name: 'Hints' })).toHaveCount(0);

  await typeSolution(page);
  await page.getByRole('button', { name: 'Run' }).click();
  await expect(page.getByTestId('verdict')).toHaveText('Accepted', { timeout: 60_000 });
  await page.getByRole('button', { name: 'Submit' }).click();

  await expect(page.getByTestId('follow-ups')).toBeVisible({ timeout: 60_000 });
  await answerFollowUps(page);

  const result = page.getByTestId('attempt-result');
  await expect(result).toBeVisible({ timeout: 30_000 });
  await expect(result.locator('[data-status="verified"]')).toHaveText('Verified');
  await expect(result.getByText(/of \d correct/)).toHaveText(/(\d) of \1 correct/);
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  const serious = axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
  expect(serious, JSON.stringify(serious.map((v) => v.id))).toEqual([]);

  // The replay reproduces the session.
  await page.getByRole('link', { name: 'Watch your replay' }).click();
  const viewer = page.getByTestId('replay-viewer');
  await expect(viewer).toBeVisible();
  await expect(viewer.getByText(/Submit: accepted/)).toBeVisible();
  await expect(viewer.getByText('The recorded edits do not reproduce')).toHaveCount(0);
  await viewer.getByRole('button', { name: /Submit: accepted/ }).click();
  await expect(viewer.getByRole('list', { name: /Code at/ })).toContainText(
    'return [seen[need], j]',
  );

  // The challenge now shows as verified, and one free start is used.
  await page.goto('/verified');
  await expect(page.getByText('2 of 3 free starts left this week.')).toBeVisible();
  await expect(page.locator('[data-status="verified"]')).toBeVisible();
});
