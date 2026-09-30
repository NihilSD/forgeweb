import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ExecRequest, ExecResult, ExecTestResult } from '@forge/shared';
import { parseCsv } from './csv.js';
import { parseHarnessOutput } from './parse.js';
import { prepareSource } from './prepare.js';
import type { Executor } from './types.js';
import { runWithProgressWatchdog } from './watchdog.js';

export interface DockerExecutorConfig {
  /** `runsc` (gVisor) in production. `runc` is for development machines without gVisor. */
  runtime: 'runsc' | 'runc';
  images: { python: string; node: string; sql: string };
  /** Host directory for per-run work dirs (mounted read-only into the container). */
  workRoot?: string;
  dockerBin?: string;
  cpus?: number;
  pidsLimit?: number;
}

const TEST_ID = /^[A-Za-z0-9:_-]{1,64}$/;

/**
 * Runs every submission in a fresh container (spec 6.1): no network, read-only root filesystem,
 * small tmpfs, non-root user, all capabilities dropped, default seccomp profile, no-new-privileges,
 * memory/CPU/pids/file-size limits. The container is destroyed after every run.
 */
export class DockerExecutor implements Executor {
  readonly name: string;
  private readonly docker: string;

  constructor(private readonly cfg: DockerExecutorConfig) {
    if (
      cfg.runtime !== 'runsc' &&
      process.env.NODE_ENV === 'production' &&
      process.env.RUNNER_ALLOW_RUNC !== 'true'
    ) {
      throw new Error('Production runners must use the gVisor runtime (runsc).');
    }
    this.docker = cfg.dockerBin ?? 'docker';
    this.name = `docker (${cfg.runtime})`;
  }

  /** The docker arguments that isolate a run. Exposed for the attack-suite report. */
  isolationArgs(memoryMb: number, tmpfsMb: number, user: string): string[] {
    return [
      '--runtime',
      this.cfg.runtime,
      '--network',
      'none',
      '--read-only',
      '--tmpfs',
      `/tmp:rw,nosuid,nodev,size=${tmpfsMb}m,mode=1777`,
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges',
      '--pids-limit',
      String(this.cfg.pidsLimit ?? 64),
      '--memory',
      `${memoryMb}m`,
      '--memory-swap',
      `${memoryMb}m`,
      '--cpus',
      String(this.cfg.cpus ?? 1),
      '--ulimit',
      'fsize=16777216:16777216',
      '--ulimit',
      'nofile=256:256',
      '--ulimit',
      'core=0:0',
      '--user',
      user,
      '--ipc',
      'none',
      '--log-driver',
      'none',
    ];
  }

  async run(request: ExecRequest): Promise<ExecResult> {
    for (const t of request.tests) {
      if (!TEST_ID.test(t.id)) return internal(`invalid test id ${JSON.stringify(t.id)}`);
    }
    const prepared = await prepareSource(request.language, request.code, request.entry);
    if (!prepared.ok)
      return {
        status: 'compile_error',
        tests: [],
        timeMs: 0,
        memoryKb: null,
        message: prepared.error,
      };

    const dir = await mkdtemp(join(this.cfg.workRoot ?? tmpdir(), 'forge-run-'));
    const name = `forge-run-${randomUUID()}`;
    try {
      await chmod(dir, 0o755);
      const put = async (file: string, content: string) => {
        await writeFile(join(dir, file), content, { mode: 0o644 });
      };
      let image: string;
      let cmd: string[];
      let user = '10001:10001';
      let memoryMb = request.limits.memoryMb;
      let tmpfsMb = 64;
      if (request.language === 'sql') {
        image = this.cfg.images.sql;
        cmd = [];
        user = '70:70';
        // PostgreSQL itself needs room on top of the query's budget.
        memoryMb = Math.max(memoryMb, 256);
        tmpfsMb = 256;
        await put('solution.sql', prepared.source);
        await put('limits', String(request.limits.timeMs));
        await mkdir(join(dir, 'tests'), { mode: 0o755 });
        for (const [i, t] of request.tests.entries()) {
          const td = join('tests', String(i).padStart(4, '0'));
          await mkdir(join(dir, td), { mode: 0o755 });
          await put(join(td, 'id'), t.id);
          await put(join(td, 'setup.sql'), t.setupSql ?? '');
        }
      } else {
        const node = request.language !== 'python';
        image = node ? this.cfg.images.node : this.cfg.images.python;
        await put(
          'request.json',
          JSON.stringify({ entry: request.entry, tests: request.tests, limits: request.limits }),
        );
        await put(prepared.filename, prepared.source);
        cmd = ['/work/request.json', `/work/${prepared.filename}`];
        if (node) {
          // V8 reports heap exhaustion cleanly just below the cgroup limit.
          cmd = [
            `--max-old-space-size=${Math.max(32, memoryMb - 32)}`,
            '/opt/forge/harness.mjs',
            ...cmd,
          ];
        }
      }

      const args = [
        'run',
        '--rm',
        '--name',
        name,
        ...this.isolationArgs(memoryMb, tmpfsMb, user),
        '-v',
        `${dir}:/work:ro`,
        '--workdir',
        '/tmp',
        ...(request.language !== 'python' && request.language !== 'sql'
          ? ['--entrypoint', 'node']
          : []),
        image,
        ...cmd,
      ];
      const perTest = request.limits.timeMs + 1500;
      const proc = await runWithProgressWatchdog(this.docker, args, {
        startupMs: request.language === 'sql' ? 30_000 : 15_000,
        perResultMs: request.language === 'sql' ? perTest + 5000 : perTest,
        totalMs: request.limits.timeMs * Math.max(1, request.tests.length) + 60_000,
        maxStdoutBytes:
          (request.limits.outputKb * 1024 * 2 + 16_384) * Math.max(1, request.tests.length) +
          65_536,
        onKill: () => {
          spawn(this.docker, ['kill', name], { stdio: 'ignore' }).on('error', () => undefined);
        },
      });

      if (
        /Unable to find image|No such image|Cannot connect to the Docker daemon|unknown or invalid runtime/i.test(
          proc.stderr,
        )
      ) {
        return internal(`runner misconfigured: ${proc.stderr.trim().split('\n').pop()}`);
      }
      const outOfMemory =
        (!proc.timedOut && proc.exitCode === 137) ||
        /heap out of memory|MemoryError|Cannot allocate memory/i.test(proc.stderr);
      let results = proc.results;
      if (request.language === 'sql') results = decodeSqlLines(results);
      const parsed = parseHarnessOutput(request, { ...proc, results, outOfMemory, memoryKb: null });
      return proc.outputExceeded ? { ...parsed, status: 'output_limit' } : parsed;
    } catch (err) {
      return internal((err as Error).message);
    } finally {
      spawn(this.docker, ['rm', '-f', name], { stdio: 'ignore' }).on('error', () => undefined);
      await rm(dir, { recursive: true, force: true });
    }
  }
}

function internal(message: string): ExecResult {
  return { status: 'internal_error', tests: [], timeMs: 0, memoryKb: null, message };
}

/** The SQL harness base64-encodes CSV and errors; turn them into normal result lines. */
function decodeSqlLines(results: string): string {
  return results
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      let obj: Record<string, unknown>;
      try {
        obj = JSON.parse(line) as Record<string, unknown>;
      } catch {
        return line;
      }
      if (obj.type !== 'test') return line;
      const out: Partial<ExecTestResult> & { type: string } = {
        type: 'test',
        id: String(obj.id),
        status: obj.status as ExecTestResult['status'],
        timeMs: Number(obj.timeMs ?? 0),
      };
      if (typeof obj.csvB64 === 'string') {
        const rows = parseCsv(Buffer.from(obj.csvB64, 'base64').toString('utf8'));
        out.columns = (rows[0] ?? []).map((c) => c ?? '');
        out.value = rows.slice(1);
      }
      if (typeof obj.errorB64 === 'string') {
        out.error = Buffer.from(obj.errorB64, 'base64')
          .toString('utf8')
          .replace(/^psql:[^:]*:\d+: /gm, '')
          .trim()
          .slice(0, 2000);
      }
      return JSON.stringify(out);
    })
    .join('\n');
}
