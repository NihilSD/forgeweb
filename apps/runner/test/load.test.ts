/**
 * Spec L4 acceptance: 100 concurrent submissions complete without errors on a development
 * machine, median run time under 2 seconds. Opt-in (RUN_LOAD_TEST=1) because it takes a while.
 * Concurrency mirrors a runner host: RUNNER_CONCURRENCY sandboxes at once, the rest queue.
 */
import { describe, expect, it } from 'vitest';
import { dockerAvailable, executor } from './sandbox.js';

const enabled = process.env.RUN_LOAD_TEST === '1' && dockerAvailable();
const SLOTS = Number(process.env.RUNNER_CONCURRENCY ?? 8);

describe.skipIf(!enabled)('runner load', () => {
  it('runs 100 concurrent simple submissions without errors', async () => {
    const languages = ['python', 'javascript', 'typescript'] as const;
    const code = {
      python: 'def f(xs):\n    return sorted(xs)',
      javascript: 'function f(xs) { return [...xs].sort((a, b) => a - b) }',
      typescript: 'function f(xs: number[]): number[] { return [...xs].sort((a, b) => a - b) }',
    };
    const jobs = Array.from({ length: 100 }, (_, i) => languages[i % 3]!);
    const durations: number[] = [];
    const failures: string[] = [];
    let next = 0;
    const started = Date.now();
    await Promise.all(
      Array.from({ length: SLOTS }, async () => {
        while (next < jobs.length) {
          const language = jobs[next++]!;
          const t0 = Date.now();
          const res = await executor.run({
            language,
            code: code[language],
            entry: 'f',
            tests: Array.from({ length: 5 }, (_, k) => ({ id: `t${k}`, args: [[5, 3, k, 1]] })),
            limits: { timeMs: 2000, memoryMb: 128, outputKb: 64 },
          });
          durations.push(Date.now() - t0);
          if (res.status !== 'ok' || res.tests.some((t) => t.status !== 'ok'))
            failures.push(`${language}: ${res.status} ${res.message ?? ''}`);
        }
      }),
    );
    durations.sort((a, b) => a - b);
    const median = durations[Math.floor(durations.length / 2)]!;
    const p95 = durations[Math.floor(durations.length * 0.95)]!;
    console.info(
      `100 runs, ${SLOTS} slots: total ${Date.now() - started}ms, median ${median}ms, p95 ${p95}ms`,
    );
    expect(failures).toEqual([]);
    expect(median).toBeLessThan(2000);
  }, 600_000);
});
