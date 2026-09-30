import { spawn } from 'node:child_process';

export const RESULT_MARKER = '\x1eFORGE\x1f';

export interface WatchedProcess {
  /** Harness result lines (marker stripped), newline-joined. */
  results: string;
  stderr: string;
  timedOut: boolean;
  /** Stdout grew past the byte cap and the process was killed. */
  outputExceeded: boolean;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  wallMs: number;
}

export interface WatchdogOptions {
  cwd?: string;
  env?: Record<string, string>;
  /** Max time allowed before the harness reports "start" (interpreter/container startup). */
  startupMs: number;
  /** Max time between two result lines: the per-test limit plus a margin. */
  perResultMs: number;
  /** Absolute ceiling for the whole run. */
  totalMs: number;
  /** Kill if stdout exceeds this many bytes. */
  maxStdoutBytes: number;
  /** Called when the watchdog fires, before SIGKILL (e.g. to `docker kill` a container). */
  onKill?: () => void;
}

/**
 * Runs a harness process and kills it when it stops making progress. Harnesses print one line per
 * finished test, so "no line for perResultMs" means the current test is stuck (an infinite loop
 * cannot be interrupted from inside the process). Also enforces a total and an output ceiling.
 */
export function runWithProgressWatchdog(
  cmd: string,
  args: string[],
  opts: WatchdogOptions,
): Promise<WatchedProcess> {
  return new Promise((resolvePromise) => {
    const started = performance.now();
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: opts.env ?? { PATH: process.env.PATH ?? '/usr/bin:/bin' },
    });
    let stdoutBytes = 0;
    let pending = '';
    const results: string[] = [];
    let stderr = '';
    let timedOut = false;
    let outputExceeded = false;
    let killed = false;

    const kill = () => {
      if (killed) return;
      killed = true;
      opts.onKill?.();
      child.kill('SIGKILL');
    };
    let progressTimer = setTimeout(() => {
      timedOut = true;
      kill();
    }, opts.startupMs);
    const totalTimer = setTimeout(() => {
      timedOut = true;
      kill();
    }, opts.totalMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > opts.maxStdoutBytes) {
        outputExceeded = true;
        kill();
        return;
      }
      pending += chunk.toString('utf8');
      let idx: number;
      let progressed = false;
      while ((idx = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, idx);
        pending = pending.slice(idx + 1);
        const at = line.indexOf(RESULT_MARKER);
        if (at !== -1) {
          results.push(line.slice(at + RESULT_MARKER.length));
          progressed = true;
        }
      }
      if (progressed && !killed) {
        clearTimeout(progressTimer);
        progressTimer = setTimeout(() => {
          timedOut = true;
          kill();
        }, opts.perResultMs);
      }
    });
    child.stderr.on('data', (d: Buffer) => {
      if (stderr.length < 20_000) stderr += d.toString('utf8');
    });
    child.on('close', (code, signal) => {
      clearTimeout(progressTimer);
      clearTimeout(totalTimer);
      resolvePromise({
        results: results.join('\n'),
        stderr,
        timedOut,
        outputExceeded,
        exitCode: code,
        signal,
        wallMs: performance.now() - started,
      });
    });
  });
}
