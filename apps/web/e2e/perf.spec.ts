/**
 * Spec 9 performance budgets: public pages LCP < 2.5 s on 4G; editor ready < 2 s after navigation.
 * Only meaningful against a production build: run with `CI=1 PERF=1 pnpm test:e2e e2e/perf.spec.ts`.
 */
import { expect, type Page, test } from '@playwright/test';
import { signUpAndOnboard } from './helpers';

test.skip(!process.env.PERF, 'performance budgets run against a production build (PERF=1)');

/** "Fast 4G" as used by Lighthouse: 150 ms RTT, 1.6 Mbps down, 750 Kbps up, CPU x4 slower. */
async function emulate4g(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
}

async function lcp(page: Page, path: string): Promise<number> {
  await page.goto(path, { waitUntil: 'load' });
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        let value = 0;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) value = Math.max(value, e.startTime);
        }).observe({ type: 'largest-contentful-paint', buffered: true });
        setTimeout(() => resolve(value), 1500);
      }),
  );
}

for (const path of ['/', '/problems', '/learn', '/pricing']) {
  test(`LCP under 2.5 s on 4G: ${path}`, async ({ page }) => {
    await emulate4g(page);
    await page.goto(path); // warm the server, not the browser cache
    await page.context().clearCookies();
    const fresh = await page.context().browser()!.newContext();
    const p2 = await fresh.newPage();
    await emulate4g(p2);
    const value = await lcp(p2, path);
    console.info(`LCP ${path}: ${Math.round(value)} ms`);
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(2500);
    await fresh.close();
  });
}

test('editor ready under 2 s after navigation', async ({ page }) => {
  await signUpAndOnboard(page);
  await page.goto('/problems/fix-average-rating/solve');
  await expect(page.locator('.monaco-editor')).toBeVisible({ timeout: 30_000 });
  // Measure a fresh client-side navigation to the workspace.
  await page.goto('/problems');
  const started = Date.now();
  await page.goto('/problems/two-sum-orders/solve');
  await expect(page.locator('.monaco-editor .view-lines')).toBeVisible({ timeout: 10_000 });
  const ms = Date.now() - started;
  console.info(`editor ready: ${ms} ms`);
  expect(ms).toBeLessThan(2000);
});
