import { existsSync, readFileSync, rmSync } from 'node:fs';
import { RUNNER_PID_FILE } from './global-setup';

export default function globalTeardown() {
  if (!existsSync(RUNNER_PID_FILE)) return;
  const pid = Number(readFileSync(RUNNER_PID_FILE, 'utf8'));
  try {
    process.kill(-pid, 'SIGTERM'); // the whole process group (pnpm → tsx → node)
  } catch {
    // Already gone.
  }
  rmSync(RUNNER_PID_FILE, { force: true });
}
