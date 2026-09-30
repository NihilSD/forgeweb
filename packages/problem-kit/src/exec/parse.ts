import type { ExecRequest, ExecResult, ExecTestResult } from '@forge/shared';

export interface ProcessOutcome {
  /** Harness result lines (JSON), newline-joined. */
  results: string;
  /** The watchdog killed the process for exceeding the wall-clock budget. */
  timedOut: boolean;
  /** Killed for exceeding memory (cgroup OOM, or V8 heap exhaustion). */
  outOfMemory: boolean;
  /** Process stderr (harness or interpreter crash output). */
  stderr: string;
  exitCode: number | null;
  wallMs: number;
  memoryKb: number | null;
}

type HarnessLine =
  | { type: 'start' | 'done' }
  | { type: 'compile_error' | 'load_error'; error: string }
  | ({ type: 'test' } & ExecTestResult);

/** Converts harness output plus how the process ended into an ExecResult. */
export function parseHarnessOutput(request: ExecRequest, outcome: ProcessOutcome): ExecResult {
  const lines: HarnessLine[] = [];
  for (const raw of outcome.results.split('\n')) {
    if (!raw.trim()) continue;
    try {
      lines.push(JSON.parse(raw) as HarnessLine);
    } catch {
      // A truncated last line means the process died mid-write; handled below.
    }
  }
  const base = { timeMs: Math.round(outcome.wallMs), memoryKb: outcome.memoryKb };

  const failure = lines.find((l) => l.type === 'compile_error' || l.type === 'load_error');
  if (failure && 'error' in failure) {
    return {
      ...base,
      status: failure.type === 'compile_error' ? 'compile_error' : 'runtime_error',
      tests: [],
      message: failure.error,
    };
  }

  const byId = new Map<string, ExecTestResult>();
  for (const l of lines) {
    if (l.type === 'test') {
      const { type: _type, ...rest } = l;
      const r = rest as ExecTestResult;
      if (r.status === 'ok' && r.timeMs > request.limits.timeMs) r.status = 'time_limit';
      byId.set(r.id, r);
    }
  }

  const tests: ExecTestResult[] = [];
  let missingStatus: ExecTestResult['status'] | null = null;
  for (const t of request.tests) {
    const r = byId.get(t.id);
    if (r) {
      tests.push(r);
      continue;
    }
    if (missingStatus === null) {
      // The first test without a result is the one that was running when the process ended.
      missingStatus = outcome.outOfMemory
        ? 'memory_limit'
        : outcome.timedOut
          ? 'time_limit'
          : 'error';
      tests.push({
        id: t.id,
        status: missingStatus,
        timeMs: 0,
        ...(missingStatus === 'error' ? { error: crashMessage(outcome) } : {}),
      });
    }
  }

  const status: ExecResult['status'] = outcome.outOfMemory
    ? 'memory_limit'
    : outcome.timedOut
      ? 'time_limit'
      : missingStatus === 'error'
        ? 'runtime_error'
        : 'ok';
  return { ...base, status, tests };
}

function crashMessage(outcome: ProcessOutcome): string {
  const tail = outcome.stderr.trim().split('\n').slice(-5).join('\n');
  return tail
    ? `Your program crashed:\n${tail}`.slice(0, 2000)
    : `Your program exited unexpectedly (code ${outcome.exitCode}).`;
}
