import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

/** Applies migrations to the test database once per run. */
export default function setup() {
  const url = process.env.DATABASE_URL ?? 'postgresql://forge:forge@localhost:5432/forge_test';
  execSync('pnpm exec prisma migrate deploy', {
    cwd: resolve(import.meta.dirname, '../../../packages/db'),
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}
