import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Unit tests only; Playwright specs in e2e/ run with `pnpm test:e2e`.
export default defineConfig({
  // Next keeps JSX as-is (tsconfig "jsx": "preserve"); tests need it compiled.
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { include: ['src/**/*.test.{ts,tsx}'], passWithNoTests: true },
});
