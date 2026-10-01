import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import pg from 'pg';
import { E2E_DATABASE_URL } from './global-setup';
import { signUpAndOnboard, uniqueEmail } from './helpers';

/** Gives the user 5 rated events in the problem's track, as the rating queue would. */
async function seedRatings(email: string) {
  const db = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await db.connect();
  try {
    const user = (await db.query('SELECT id FROM "User" WHERE email = $1', [email])).rows[0];
    const p = (
      await db.query('SELECT id, "trackId", rating FROM "Problem" WHERE slug = $1', [
        'two-sum-orders',
      ])
    ).rows[0];
    const steps = [
      [1500, 1612, 1],
      [1612, 1540, 0],
      [1540, 1601, 1],
      [1601, 1648, 1],
      [1648, 1671, 1],
    ];
    for (const [i, [before, after, score]] of steps.entries()) {
      await db.query(
        `INSERT INTO "RatingChange" (id, "userId", "trackId", "eventKey", kind, "problemId", score,
           opponent, "ratingBefore", "ratingAfter", "rdBefore", "rdAfter", volatility, at)
         VALUES (gen_random_uuid(), $1, $2, $3, 'verified', $4, $5, $6, $7, $8, 300, 200, 0.06,
           now() - ($9 || ' days')::interval)`,
        [user.id, p.trackId, `seed:${i}`, p.id, score, p.rating, before, after, String(10 - i)],
      );
    }
    await db.query(
      `INSERT INTO "Rating" (id, "userId", "trackId", rating, rd, volatility, events, "lastEventAt", "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, 1671, 95, 0.06, 5, now() - interval '6 days', now())`,
      [user.id, p.trackId],
    );
  } finally {
    await db.end();
  }
}

test('placement: no rating until 5 rated events, and the explainer page', async ({ page }) => {
  await signUpAndOnboard(page);
  await page.goto('/ratings');
  await expect(page.getByRole('heading', { name: 'Ratings', level: 1 })).toBeVisible();
  await expect(page.getByText(/No rated events yet/).first()).toBeVisible();
  await page.getByRole('link', { name: 'How ratings work' }).click();
  await expect(page.getByText(/Practice never changes your rating/)).toBeVisible();
  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual(
    [],
  );
});

test('a placed rating shows its value, a keyboard-readable chart and a table', async ({ page }) => {
  const email = uniqueEmail('rating');
  await signUpAndOnboard(page, { email });
  await seedRatings(email);
  await page.goto('/ratings');
  const card = page.getByTestId(/^rating-/).filter({ hasText: '1671' });
  await expect(card).toBeVisible();
  await expect(card.getByText('±190')).toBeVisible();

  const chart = card.getByRole('img', { name: /rating: 5 rated events, from 1612 to 1671/ });
  await chart.focus();
  await page.keyboard.press('ArrowLeft');
  await expect(card.getByRole('status')).toContainText('Rating 1648 (+47)');

  await card.getByText('Show as a table').click();
  await expect(card.getByRole('table').getByRole('row')).toHaveCount(6);

  const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  expect(axe.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual(
    [],
  );
});
