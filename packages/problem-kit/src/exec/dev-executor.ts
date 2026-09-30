/**
 * ============================================================================================
 *  DEVELOPMENT EXECUTOR — NOT A SANDBOX. NEVER USE IN PRODUCTION.
 *
 *  Runs code directly on this machine with no isolation. It exists only so content authors can
 *  validate problem packages (reference, starter and wrong solutions written by the Forge team)
 *  on their laptop and in CI. User submissions go through apps/runner (gVisor sandboxes).
 *  It refuses to start when NODE_ENV=production.
 * ============================================================================================
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { ExecRequest, ExecResult } from '@forge/shared';
import pg from 'pg';
import { parseHarnessOutput } from './parse.js';
import { prepareSource } from './prepare.js';
import type { Executor } from './types.js';
import { runWithProgressWatchdog } from './watchdog.js';

export const HARNESS_DIR = resolve(import.meta.dirname, '../../harness');

function assertNotProduction() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('The development executor must never run in production. Use apps/runner.');
  }
}

export class DevExecutor implements Executor {
  readonly name = 'dev (UNSANDBOXED)';

  constructor(private readonly opts: { sqlDatabaseUrl?: string } = {}) {
    assertNotProduction();
  }

  async run(request: ExecRequest): Promise<ExecResult> {
    assertNotProduction();
    if (request.language === 'sql') return this.runSql(request);
    const prepared = await prepareSource(request.language, request.code, request.entry);
    if (!prepared.ok)
      return {
        status: 'compile_error',
        tests: [],
        timeMs: 0,
        memoryKb: null,
        message: prepared.error,
      };

    const dir = await mkdtemp(join(tmpdir(), 'forge-dev-'));
    try {
      const requestPath = join(dir, 'request.json');
      const solutionPath = join(dir, prepared.filename);
      await writeFile(
        requestPath,
        JSON.stringify({ entry: request.entry, tests: request.tests, limits: request.limits }),
      );
      await writeFile(solutionPath, prepared.source);
      const [cmd, args] =
        request.language === 'python'
          ? [
              'python3',
              ['-I', '-S', join(HARNESS_DIR, 'python_harness.py'), requestPath, solutionPath],
            ]
          : [
              process.execPath,
              [
                `--max-old-space-size=${request.limits.memoryMb}`,
                join(HARNESS_DIR, 'node_harness.mjs'),
                requestPath,
                solutionPath,
              ],
            ];
      const proc = await runWithProgressWatchdog(cmd, args as string[], {
        cwd: dir,
        startupMs: 10_000,
        perResultMs: request.limits.timeMs + 1500,
        totalMs: request.limits.timeMs * Math.max(1, request.tests.length) + 10_000,
        maxStdoutBytes:
          (request.limits.outputKb * 1024 + 16_384) * Math.max(1, request.tests.length) + 65_536,
      });
      const outOfMemory = /heap out of memory|MemoryError|Cannot allocate memory/i.test(
        proc.stderr,
      );
      const result = parseHarnessOutput(request, { ...proc, outOfMemory, memoryKb: null });
      return proc.outputExceeded ? { ...result, status: 'output_limit' } : result;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  /** Runs trusted SQL (package reference/wrong solutions) in a throwaway schema. */
  private async runSql(request: ExecRequest): Promise<ExecResult> {
    const url =
      this.opts.sqlDatabaseUrl ?? process.env.DEV_SQL_DATABASE_URL ?? process.env.DATABASE_URL;
    if (!url)
      throw new Error('Set DEV_SQL_DATABASE_URL (or DATABASE_URL) to validate SQL problems.');
    const client = new pg.Client({ connectionString: url });
    await client.connect();
    const started = performance.now();
    const tests: ExecResult['tests'] = [];
    try {
      for (const t of request.tests) {
        const schema = `forge_dev_${Math.random().toString(36).slice(2, 10)}`;
        const t0 = performance.now();
        try {
          await client.query('BEGIN');
          await client.query(`CREATE SCHEMA ${schema}`);
          await client.query(`SET LOCAL search_path TO ${schema}`);
          await client.query(`SET LOCAL statement_timeout = ${request.limits.timeMs}`);
          if (t.setupSql) await client.query(t.setupSql);
          const res = await client.query({ text: request.code, rowMode: 'array' });
          if (Array.isArray(res)) throw new Error('Submit a single SELECT statement.');
          tests.push({
            id: t.id,
            status: 'ok',
            value: res.rows.map((r: unknown[]) =>
              r.map((v) => (v === null ? null : v instanceof Date ? v.toISOString() : String(v))),
            ),
            columns: res.fields.map((f) => f.name),
            timeMs: performance.now() - t0,
          });
        } catch (err) {
          const e = err as { code?: string; message: string };
          tests.push({
            id: t.id,
            status: e.code === '57014' ? 'time_limit' : 'error',
            error: e.message,
            timeMs: performance.now() - t0,
          });
        } finally {
          await client.query('ROLLBACK').catch(() => undefined);
        }
      }
    } finally {
      await client.end();
    }
    return { status: 'ok', tests, timeMs: Math.round(performance.now() - started), memoryKb: null };
  }
}
