import { execFileSync } from 'node:child_process';
import { DockerExecutor } from '@forge/problem-kit/docker-executor';
import type { ExecRequest, ExecResult } from '@forge/shared';

export function dockerAvailable(): boolean {
  try {
    execFileSync('docker', ['image', 'inspect', 'forge-sandbox-python:latest'], { stdio: 'ignore' });
    return true;
  } catch {
    if (process.env.REQUIRE_DOCKER === '1') {
      throw new Error('Docker and the sandbox images are required (run sandboxes/build.sh).');
    }
    return false;
  }
}

export const executor = new DockerExecutor({
  runtime: (process.env.RUNNER_RUNTIME as 'runsc' | 'runc' | undefined) ?? 'runc',
  images: {
    python: process.env.RUNNER_IMAGE_PYTHON ?? 'forge-sandbox-python:latest',
    node: process.env.RUNNER_IMAGE_NODE ?? 'forge-sandbox-node:latest',
    sql: process.env.RUNNER_IMAGE_SQL ?? 'forge-sandbox-postgres-sql:latest',
  },
});

export const LIMITS = { timeMs: 2000, memoryMb: 128, outputKb: 64 };

/** Runs `f()` once and returns the executor result. */
export function runF(language: ExecRequest['language'], code: string, limits = LIMITS): Promise<ExecResult> {
  return executor.run({ language, code, entry: 'f', tests: [{ id: 't1', args: [] }], limits });
}

export function runSql(code: string, setupSql = 'CREATE TABLE t (x int); INSERT INTO t VALUES (1);'): Promise<ExecResult> {
  return executor.run({ language: 'sql', code, tests: [{ id: 't1', setupSql }], limits: LIMITS });
}

export function leftoverContainers(): string[] {
  return execFileSync('docker', ['ps', '-a', '--filter', 'name=forge-run-', '--format', '{{.Names}}'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);
}
