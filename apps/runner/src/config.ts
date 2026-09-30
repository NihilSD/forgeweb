import { existsSync } from 'node:fs';
import { hostname } from 'node:os';
import { resolve } from 'node:path';
import { z } from 'zod';

const rootEnv = resolve(import.meta.dirname, '../../../.env');
if (process.env.NODE_ENV !== 'production' && existsSync(rootEnv)) process.loadEnvFile(rootEnv);

/**
 * Runner hosts get exactly three secrets: the job Redis URL (restricted ACL user), the job
 * verification keys and the callback signing keys. No database or cloud credentials (spec 3.3).
 */
export const runnerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  RUNNER_ID: z.string().default(hostname()),
  RUNNER_REDIS_URL: z.string().min(1).default('redis://localhost:6379/2'),
  RUNNER_JOB_SIGNING_KEYS: z.string().min(1),
  RUNNER_CALLBACK_KEYS: z.string().min(1),
  RUNNER_CALLBACK_URL: z.url().default('http://localhost:4000/api/v1/internal/runner/callback'),
  RUNNER_RUNTIME: z.enum(['runsc', 'runc']).default('runsc'),
  RUNNER_CONCURRENCY: z.coerce.number().int().min(1).max(64).default(4),
  RUNNER_IMAGE_PYTHON: z.string().default('forge-sandbox-python:latest'),
  RUNNER_IMAGE_NODE: z.string().default('forge-sandbox-node:latest'),
  RUNNER_IMAGE_SQL: z.string().default('forge-sandbox-postgres-sql:latest'),
});
export type RunnerEnv = z.infer<typeof runnerEnvSchema>;

export function loadRunnerEnv(source: NodeJS.ProcessEnv = process.env): RunnerEnv {
  const parsed = runnerEnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(
      `Invalid runner configuration:\n${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n')}`,
    );
  }
  return parsed.data;
}
