import type { ExecResult, Verdict } from '@forge/shared';
import { compare } from './compare.js';
import type { Comparator, TestCase, TestSuite } from './schema.js';

export interface GradedTest {
  id: string;
  category: string;
  visible: boolean;
  passed: boolean;
  verdict: Verdict;
  timeMs: number;
  /** Visible tests only: */
  args?: unknown[];
  expected?: unknown;
  actual?: unknown;
  stdout?: string;
  error?: string;
}

export interface Grade {
  verdict: Verdict;
  testsPassed: number;
  testsTotal: number;
  runtimeMs: number;
  memoryKb: number | null;
  message?: string;
  tests: GradedTest[];
}

const STATUS_VERDICT = {
  time_limit: 'time_limit',
  memory_limit: 'memory_limit',
  output_limit: 'output_limit',
  error: 'runtime_error',
} as const;

/**
 * Grades executor output against a suite. Visible tests carry inputs, expected and actual values;
 * hidden tests carry only their category (spec 6.2).
 */
export function grade(
  suite: TestSuite,
  result: ExecResult,
  comparator: Comparator,
  opts: { only?: 'visible' | 'all' } = {},
): Grade {
  const cases: { test: TestCase; visible: boolean }[] = [
    ...suite.visible.map((test) => ({ test, visible: true })),
    ...(opts.only === 'visible' ? [] : suite.hidden.map((test) => ({ test, visible: false }))),
  ];
  const base = { testsTotal: cases.length, memoryKb: result.memoryKb };

  if (result.status === 'compile_error' || result.status === 'internal_error') {
    return {
      ...base,
      verdict: result.status,
      testsPassed: 0,
      runtimeMs: 0,
      tests: [],
      ...(result.message ? { message: result.message } : {}),
    };
  }
  if (result.tests.length === 0 && result.status === 'runtime_error') {
    // Failed while loading (e.g. an exception at import time).
    return {
      ...base,
      verdict: 'runtime_error',
      testsPassed: 0,
      runtimeMs: 0,
      tests: [],
      ...(result.message ? { message: result.message } : {}),
    };
  }

  const byId = new Map(result.tests.map((t) => [t.id, t]));
  const tests: GradedTest[] = [];
  let first: Verdict | null = null;
  let passed = 0;
  let runtimeMs = 0;

  for (const { test, visible } of cases) {
    const r = byId.get(test.id);
    let verdict: Verdict;
    if (!r) verdict = first ?? 'runtime_error';
    else if (r.status === 'ok')
      verdict = compare(comparator, r.value, test.expected) ? 'accepted' : 'wrong_answer';
    else verdict = STATUS_VERDICT[r.status];
    if (r) runtimeMs = Math.max(runtimeMs, r.timeMs);
    const ok = verdict === 'accepted';
    if (ok) passed++;
    else first ??= verdict;
    tests.push({
      id: test.id,
      category: test.category,
      visible,
      passed: ok,
      verdict,
      timeMs: Math.round(r?.timeMs ?? 0),
      ...(visible
        ? {
            args: test.args ?? [],
            expected: test.expected,
            ...(r && r.status === 'ok' ? { actual: r.value } : {}),
            ...(r?.stdout ? { stdout: r.stdout } : {}),
            ...(r?.error ? { error: r.error } : {}),
          }
        : {}),
    });
  }
  return {
    ...base,
    verdict: first ?? 'accepted',
    testsPassed: passed,
    runtimeMs: Math.round(runtimeMs),
    tests,
  };
}
