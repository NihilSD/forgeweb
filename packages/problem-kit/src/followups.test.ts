import { describe, expect, it } from 'vitest';
import {
  expectedAnswer,
  gradeFollowUp,
  matchingLines,
  parseLooseValue,
  probeTests,
  selectFollowUps,
} from './followups.js';
import type { FollowUpQuestion } from './schema.js';

const Q: FollowUpQuestion[] = [
  {
    id: 'predict',
    kind: 'predict',
    prompt: 'p',
    answer: { type: 'run', args: [[1, 2], 3], mode: 'value' },
  },
  {
    id: 'edge',
    kind: 'edge-case',
    prompt: 'e',
    options: ['Yes', 'No'],
    answer: { type: 'run', args: [[], 1], mode: 'passes', expected: [] },
  },
  {
    id: 'change',
    kind: 'change',
    prompt: 'c',
    answer: { type: 'lines', pattern: 'target', exclude: '^def ' },
  },
  {
    id: 'explain',
    kind: 'explain',
    prompt: 'x',
    options: ['map', 'sort'],
    answer: { type: 'static', value: 'map' },
  },
];

describe('follow-ups', () => {
  it('picks 3 distinct-kind questions deterministically, always one graded by running code', () => {
    for (let seed = 1; seed < 40; seed++) {
      const picked = selectFollowUps(Q, seed);
      expect(picked).toHaveLength(3);
      expect(new Set(picked.map((q) => q.kind)).size).toBe(3);
      expect(picked.some((q) => q.answer.type === 'run')).toBe(true);
      expect(selectFollowUps(Q, seed)).toEqual(picked);
    }
  });

  it('turns run questions into probe tests', () => {
    expect(probeTests(Q)).toEqual([
      { id: 'fu-predict', args: [[1, 2], 3] },
      { id: 'fu-edge', args: [[], 1] },
    ]);
  });

  it("derives the expected answer from the user's own code", () => {
    const code = 'def f(xs, target):\n    need = target - 1\n    return need\n';
    expect(expectedAnswer(Q[0]!, code, { status: 'ok', value: [0, 1] })).toEqual({
      type: 'value',
      value: [0, 1],
    });
    // A crashing probe makes the question unfair to ask.
    expect(expectedAnswer(Q[0]!, code, { status: 'error' })).toBeNull();
    expect(expectedAnswer(Q[1]!, code, { status: 'ok', value: [] })).toEqual({
      type: 'choice',
      value: 'Yes',
    });
    expect(expectedAnswer(Q[1]!, code, { status: 'ok', value: [0] })).toEqual({
      type: 'choice',
      value: 'No',
    });
    expect(expectedAnswer(Q[1]!, code, { status: 'error' })).toEqual({
      type: 'choice',
      value: 'No',
    });
    expect(expectedAnswer(Q[2]!, code, undefined)).toEqual({ type: 'lines', lines: [2] });
    expect(expectedAnswer(Q[2]!, 'def f(xs, target):\n    return 1\n', undefined)).toBeNull();
    expect(matchingLines('a\ntarget\nb target', 'target')).toEqual([2, 3]);
  });

  it('reads answers leniently', () => {
    expect(parseLooseValue('[0, 1]')).toEqual([0, 1]);
    expect(parseLooseValue('(0, 1)')).toEqual([0, 1]);
    expect(parseLooseValue("['a', None, True]")).toEqual(['a', null, true]);
    expect(parseLooseValue('hello')).toBe('hello');
    expect(gradeFollowUp({ type: 'value', value: [0, 1] }, ' [0,1] ')).toBe(true);
    expect(gradeFollowUp({ type: 'value', value: [0, 1] }, '[1, 0]')).toBe(false);
    expect(gradeFollowUp({ type: 'value', value: 0.30000000000000004 }, '0.3')).toBe(true);
    expect(gradeFollowUp({ type: 'value', value: 'cable' }, 'cable')).toBe(true);
    expect(gradeFollowUp({ type: 'value', value: 'cable' }, '"cable"')).toBe(true);
    expect(gradeFollowUp({ type: 'choice', value: 'Yes' }, 'yes')).toBe(true);
    expect(gradeFollowUp({ type: 'lines', lines: [2, 4] }, '4')).toBe(true);
    expect(gradeFollowUp({ type: 'lines', lines: [2, 4] }, 'line 2')).toBe(true);
    expect(gradeFollowUp({ type: 'lines', lines: [2, 4] }, '3')).toBe(false);
  });
});
