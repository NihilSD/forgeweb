/** Spec L4 acceptance: every verdict type is produced correctly for each language. */
import { grade } from '@forge/problem-kit';
import type { ExecRequest, Verdict } from '@forge/shared';
import { describe, expect, it } from 'vitest';
import { dockerAvailable, executor } from './sandbox.js';

const enabled = dockerAvailable();
const limits = { timeMs: 1000, memoryMb: 128, outputKb: 8 };
const suite = {
  visible: [{ id: 'a', category: 'small', args: [3], expected: 9 }],
  hidden: [{ id: 'b', category: 'large', args: [12], expected: 144 }],
};

async function verdictOf(language: ExecRequest['language'], code: string): Promise<Verdict> {
  const result = await executor.run({
    language,
    code,
    entry: 'sq',
    tests: [
      { id: 'a', args: [3] },
      { id: 'b', args: [12] },
    ],
    limits,
  });
  return grade(suite, result, 'exact').verdict;
}

const CASES: Record<
  'python' | 'javascript' | 'typescript',
  Record<Exclude<Verdict, 'internal_error'>, string>
> = {
  python: {
    accepted: 'def sq(x):\n    return x * x',
    wrong_answer: 'def sq(x):\n    return x + x',
    time_limit: 'def sq(x):\n    while True:\n        pass',
    memory_limit: 'def sq(x):\n    a = bytearray(1 << 31)\n    return len(a)',
    output_limit: 'def sq(x):\n    print("y" * 100000)\n    return x * x',
    runtime_error: 'def sq(x):\n    return 1 / 0',
    compile_error: 'def sq(x)\n    return x',
  },
  javascript: {
    accepted: 'function sq(x) { return x * x }',
    wrong_answer: 'function sq(x) { return x + x }',
    time_limit: 'function sq(x) { while (true) {} }',
    memory_limit: 'function sq(x) { const a = []; while (true) a.push(new Array(1e5).fill(x)); }',
    output_limit: 'function sq(x) { console.log("y".repeat(100000)); return x * x }',
    runtime_error: 'function sq(x) { return undefinedThing.y }',
    compile_error: 'function sq(x) { return x * }',
  },
  typescript: {
    accepted: 'function sq(x: number): number { return x * x }',
    wrong_answer: 'function sq(x: number): number { return x + x }',
    time_limit: 'function sq(x: number): number { while (true) {} }',
    memory_limit:
      'function sq(x: number): number { const a: number[][] = []; while (true) a.push(new Array(1e5).fill(x)); }',
    output_limit:
      'function sq(x: number): number { console.log("y".repeat(100000)); return x * x }',
    runtime_error: 'function sq(x: number): number { throw new Error("boom") }',
    compile_error: 'function sq(x: number: number { return x }',
  },
};

describe.skipIf(!enabled)('verdicts in real sandboxes', () => {
  for (const [language, cases] of Object.entries(CASES)) {
    describe(language, () => {
      it.each(Object.entries(cases))('%s', async (verdict, code) => {
        expect(await verdictOf(language as ExecRequest['language'], code)).toBe(verdict);
      });
    });
  }

  describe('sql', () => {
    const setupSql = "CREATE TABLE t (name text, n int); INSERT INTO t VALUES ('a', 1), ('b', 2);";
    const sqlSuite = {
      visible: [{ id: 'a', category: 'sample', setupSql, expected: [['b', '2']] }],
      hidden: [{ id: 'b', category: 'same', setupSql, expected: [['b', '2']] }],
    };
    const run = async (code: string) =>
      grade(
        sqlSuite,
        await executor.run({
          language: 'sql',
          code,
          tests: [
            { id: 'a', setupSql },
            { id: 'b', setupSql },
          ],
          limits,
        }),
        'rows',
      ).verdict;
    it.each([
      ['accepted', 'SELECT name, n FROM t WHERE n > 1;'],
      ['wrong_answer', 'SELECT name, n FROM t;'],
      ['time_limit', 'SELECT pg_sleep(3);'],
      ['runtime_error', 'SELECT nope FROM t;'],
    ])('%s', async (verdict, code) => {
      expect(await run(code)).toBe(verdict);
    });
  });
});
