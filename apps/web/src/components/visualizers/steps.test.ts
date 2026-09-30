import { describe, expect, it } from 'vitest';
import { bfsSteps, gridFillSteps, slidingWindowSteps, twoPointerSteps } from './steps';

describe('visualizer step lists', () => {
  it('two pointers ends on the right pair', () => {
    const steps = twoPointerSteps([1, 3, 4, 6, 9], 10);
    const last = steps[steps.length - 1]!;
    expect(last.done).toBe(true);
    expect([last.left, last.right]).toEqual([0, 4]);
  });

  it('sliding window tracks the best length', () => {
    const steps = slidingWindowSteps([4, 1, 1, 3, 5], 5);
    expect(steps[steps.length - 1]!.best).toBe(3);
    // Once the window is reported, it always fits the budget (shrink steps may still be over).
    expect(steps.filter((s) => s.note.startsWith('Window')).every((s) => s.total <= 5)).toBe(true);
  });

  it('grid fill ends with the number of routes', () => {
    const steps = gridFillSteps(['...', '.#.', '...']);
    expect(steps).toHaveLength(9);
    expect(steps[8]!.table[2]![2]).toBe(2);
  });

  it('BFS reports the shortest distance or unreachable', () => {
    const found = bfsSteps(['S..', '.#.', '..E']);
    expect(found[found.length - 1]!.note).toBe('Reached E in 4 steps');
    const none = bfsSteps(['S#E']);
    expect(none[none.length - 1]!.note).toMatch(/unreachable/);
  });
});
