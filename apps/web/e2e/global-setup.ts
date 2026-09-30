import { execSync, spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';

export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ?? 'postgresql://forge:forge@localhost:5432/forge_e2e';
export const MAILPIT_URL = process.env.MAILPIT_URL ?? 'http://localhost:8025';

/** Fresh schema and empty tables for every e2e run. */
export default async function globalSetup() {
  execSync('pnpm exec prisma migrate deploy', {
    cwd: resolve(import.meta.dirname, '../../../packages/db'),
    env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL },
    stdio: 'pipe',
  });
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  const { rows } = await client.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename <> '_prisma_migrations'",
  );
  if (rows.length) {
    await client.query(
      `TRUNCATE ${rows.map((r) => `"${r.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`,
    );
  }
  await client.end();
  // Sample content, published without review: development and tests only.
  execSync('pnpm exec tsx src/cli/import-problems.ts --no-validate --publish-drafts', {
    cwd: resolve(import.meta.dirname, '../../api'),
    env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: E2E_DATABASE_URL },
    stdio: 'pipe',
  });
  await fetch(`${MAILPIT_URL}/api/v1/messages`, { method: 'DELETE' }).catch(() => undefined);

  // The runner opens no ports (by design), so Playwright's webServer can't wait on it; start it
  // here and stop it in global-teardown. Development runners use runc; production requires gVisor.
  if (!process.env.E2E_EXTERNAL_RUNNER) {
    const runner = spawn('pnpm', ['exec', 'tsx', 'src/main.ts'], {
      cwd: resolve(import.meta.dirname, '../../runner'),
      env: { ...process.env, NODE_ENV: 'development', RUNNER_RUNTIME: 'runc', RUNNER_ID: 'e2e' },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    await new Promise<void>((ok, fail) => {
      const timer = setTimeout(() => fail(new Error('runner did not start')), 60_000);
      runner.stdout.on('data', (d: Buffer) => {
        if (d.toString().includes('ready')) {
          clearTimeout(timer);
          ok();
        }
      });
      runner.on('exit', (code) => fail(new Error(`runner exited with ${code}`)));
    });
    mkdirSync(resolve(import.meta.dirname, '../test-results'), { recursive: true });
    writeFileSync(RUNNER_PID_FILE, String(runner.pid));
    runner.unref();
  }
}

export const RUNNER_PID_FILE = resolve(import.meta.dirname, '../test-results/.runner.pid');
