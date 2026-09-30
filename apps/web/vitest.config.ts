import { defineConfig } from 'vitest/config';

// Unit tests only; Playwright specs in e2e/ run with `pnpm test:e2e`.
export default defineConfig({
  test: { include: ['src/**/*.test.{ts,tsx}'], passWithNoTests: true },
});
