import type { ExecRequest } from '@forge/shared';
import { describe, expect, it } from 'vitest';
import { compare } from './compare.js';
import { DevExecutor } from './exec/dev-executor.js';
import { flagFor } from './flag.js';
import { grade } from './grade.js';
import { parseHints, placeholders, render } from './render.js';
import { createRng, seedFrom } from './rng.js';

describe('rng', () => {
  it('is deterministic per seed and differs between seeds', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 5 }, () => a.int(0, 1_000_000));
    expect(Array.from({ length: 5 }, () => b.int(0, 1_000_000))).toEqual(seqA);
    const c = createRng(43);
    expect(Array.from({ length: 5 }, () => c.int(0, 1_000_000))).not.toEqual(seqA);
    expect(seedFrom('abc')).toBe(seedFrom('abc'));
  });

  it('keeps ints in range', () => {
    const r = createRng(1);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(3, 7);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(7);
    }
  });
});

describe('render', () => {
  it('fills placeholders and refuses missing ones', () => {
    expect(render('Hi {{ name }}, {{n}}', { name: 'Ana', n: 3 })).toBe('Hi Ana, 3');
    expect(() => render('{{x}}', {})).toThrow(/x/);
    expect(placeholders('{{a}} {{b}} {{a}}')).toEqual(['a', 'b']);
  });

  it('parses four hint levels', () => {
    const md = '## 1. Nudge\na\n## 2. Approach\nb\n## 3. Pseudocode\nc\n## 4. Solution\nd';
    expect(parseHints(md)).toEqual(['a', 'b', 'c', 'd']);
    expect(() => parseHints('## Nudge\na')).toThrow();
  });
});

describe('compare', () => {
  it('handles each comparator', () => {
    expect(compare('exact', { b: 1, a: [1, 2] }, { a: [1, 2], b: 1 })).toBe(true);
    expect(compare('exact', [1, 2], [2, 1])).toBe(false);
    expect(compare('unordered', [[1], [2]], [[2], [1]])).toBe(true);
    expect(compare('float', 1 / 3, 0.3333333333)).toBe(true);
    expect(compare('float', 0.34, 0.33)).toBe(false);
    expect(compare('rows', [['Ana', '12.50']], [['Ana', '12.5']])).toBe(true);
    expect(compare('rows', [['a'], ['b']], [['b'], ['a']])).toBe(false);
    expect(compare('rows-unordered', [['a'], ['b']], [['b'], ['a']])).toBe(true);
    expect(compare('rows', [[null]], [['']])).toBe(false);
  });
});

describe('flags', () => {
  it('are per user and per challenge', () => {
    const f = flagFor('s', 'user-a', 'ch-1');
    expect(f).toMatch(/^FORGE\{[0-9a-f]{24}\}$/);
    expect(flagFor('s', 'user-b', 'ch-1')).not.toBe(f);
    expect(flagFor('s', 'user-a', 'ch-2')).not.toBe(f);
  });
});

describe('dev executor verdicts', () => {
  const ex = new DevExecutor();
  const limits = { timeMs: 500, memoryMb: 128, outputKb: 8 };
  const suite = {
    visible: [{ id: 'a', category: 'x', args: [2], expected: 4 }],
    hidden: [{ id: 'b', category: 'y', args: [3], expected: 9 }],
  };
  const run = async (language: ExecRequest['language'], code: string) =>
    grade(
      suite,
      await ex.run({
        language,
        code,
        entry: 'sq',
        tests: [
          { id: 'a', args: [2] },
          { id: 'b', args: [3] },
        ],
        limits,
      }),
      'exact',
    );

  it.each([
    ['python', 'def sq(x):\n    return x * x', 'accepted'],
    ['python', 'def sq(x):\n    return x + x', 'wrong_answer'],
    ['python', 'def sq(x):\n    while True: pass', 'time_limit'],
    ['python', 'def sq(x):\n    raise ValueError("boom")', 'runtime_error'],
    ['python', 'def sq(x)\n    return x', 'compile_error'],
    ['python', 'def sq(x):\n    print("y" * 100000)\n    return x * x', 'output_limit'],
    ['javascript', 'function sq(x) { return x * x }', 'accepted'],
    ['javascript', 'function sq(x) { while (true) {} }', 'time_limit'],
    ['javascript', 'function sq(x) { throw new Error("boom") }', 'runtime_error'],
    ['javascript', 'function sq(x) { return x * }', 'compile_error'],
    ['typescript', 'function sq(x: number): number { return x * x }', 'accepted'],
    ['typescript', 'function sq(x: number: number { return x }', 'compile_error'],
  ] as const)('%s: %s -> %s', async (language, code, verdict) => {
    expect((await run(language, code)).verdict).toBe(verdict);
  });

  it('handles return values larger than a pipe buffer (EAGAIN regression)', async () => {
    const res = await ex.run({
      language: 'javascript',
      code: 'function big(n) { return Array.from({ length: n }, (_, i) => i) }',
      entry: 'big',
      tests: [{ id: 'a', args: [200_000] }],
      limits: { timeMs: 2000, memoryMb: 256, outputKb: 4096 },
    });
    expect(res.tests[0]?.status).toBe('ok');
    expect((res.tests[0]?.value as number[]).length).toBe(200_000);
  });

  it('hides hidden test details', async () => {
    const g = await run('python', 'def sq(x):\n    return 4');
    const hidden = g.tests.find((t) => !t.visible)!;
    expect(hidden.verdict).toBe('wrong_answer');
    expect(hidden).not.toHaveProperty('args');
    expect(hidden).not.toHaveProperty('expected');
    expect(hidden).not.toHaveProperty('actual');
  });

  it('refuses to run in production', () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      expect(() => new DevExecutor()).toThrow(/never run in production/);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});
