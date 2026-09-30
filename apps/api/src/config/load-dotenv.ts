import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** Loads the repo-root .env in local development. Production uses the host's secret store. */
const rootEnv = resolve(import.meta.dirname, '../../../../.env');
if (process.env.NODE_ENV !== 'production' && existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}
