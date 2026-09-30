/**
 * Step lists for the lesson visualizers (spec L6: "driven by step lists produced by instrumented
 * reference code"). Each function runs the real algorithm and records a snapshot per step.
 */

export interface PointerStep {
  left: number;
  right: number;
  /** Indices currently inside the window (sliding window) or the two compared cells. */
  highlight: number[];
  note: string;
  done?: boolean;
}

export function twoPointerSteps(sorted: number[], target: number): PointerStep[] {
  const steps: PointerStep[] = [];
  let i = 0;
  let j = sorted.length - 1;
  while (i < j) {
    const sum = sorted[i]! + sorted[j]!;
    if (sum === target) {
      steps.push({
        left: i,
        right: j,
        highlight: [i, j],
        note: `${sorted[i]} + ${sorted[j]} = ${target}. Found the pair.`,
        done: true,
      });
      return steps;
    }
    const move = sum < target ? 'too small: move left →' : 'too big: move right ←';
    steps.push({
      left: i,
      right: j,
      highlight: [i, j],
      note: `${sorted[i]} + ${sorted[j]} = ${sum}, ${move}`,
    });
    if (sum < target) i++;
    else j--;
  }
  steps.push({ left: i, right: j, highlight: [], note: 'Pointers met: no pair.', done: true });
  return steps;
}

export function slidingWindowSteps(
  values: number[],
  budget: number,
): (PointerStep & { best: number; total: number })[] {
  const steps: (PointerStep & { best: number; total: number })[] = [];
  let left = 0;
  let total = 0;
  let best = 0;
  for (let right = 0; right < values.length; right++) {
    total += values[right]!;
    steps.push({
      left,
      right,
      total,
      best,
      highlight: range(left, right),
      note: `Add ${values[right]}: total ${total}`,
    });
    while (total > budget) {
      total -= values[left]!;
      left++;
      steps.push({
        left,
        right,
        total,
        best,
        highlight: range(left, right),
        note: `Over ${budget}: drop from the left, total ${total}`,
      });
    }
    best = Math.max(best, right - left + 1);
    steps.push({
      left,
      right,
      total,
      best,
      highlight: range(left, right),
      note: `Window length ${right - left + 1}, best ${best}`,
    });
  }
  const last = steps[steps.length - 1];
  if (last) last.done = true;
  return steps;
}

function range(a: number, b: number): number[] {
  return Array.from({ length: Math.max(0, b - a + 1) }, (_, k) => a + k);
}

export interface GridStep {
  /** Paths count per cell so far (null = not computed yet). */
  table: (number | null)[][];
  cell: [number, number];
  note: string;
}

/** Fills the "number of routes" DP table row by row. `#` cells are blocked. */
export function gridFillSteps(grid: string[]): GridStep[] {
  const h = grid.length;
  const w = grid[0]?.length ?? 0;
  const table: (number | null)[][] = Array.from({ length: h }, () =>
    Array<number | null>(w).fill(null),
  );
  const steps: GridStep[] = [];
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      let note: string;
      if (grid[r]![c] === '#') {
        table[r]![c] = 0;
        note = 'Flower bed: 0 routes';
      } else if (r === 0 && c === 0) {
        table[r]![c] = 1;
        note = 'Start: 1 route';
      } else {
        const up = r > 0 ? table[r - 1]![c]! : 0;
        const left = c > 0 ? table[r]![c - 1]! : 0;
        table[r]![c] = up + left;
        note = `From above ${up} + from the left ${left} = ${up + left}`;
      }
      steps.push({ table: table.map((row) => [...row]), cell: [r, c], note });
    }
  }
  return steps;
}

export interface GraphStep {
  /** Distance per cell (-1 = not reached). */
  dist: number[][];
  frontier: [number, number][];
  current: [number, number] | null;
  note: string;
  done?: boolean;
}

/** Breadth-first search on a grid maze from S to E. */
export function bfsSteps(maze: string[]): GraphStep[] {
  const h = maze.length;
  const w = maze[0]?.length ?? 0;
  const dist = Array.from({ length: h }, () => Array<number>(w).fill(-1));
  let start: [number, number] = [0, 0];
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) if (maze[r]![c] === 'S') start = [r, c];
  dist[start[0]]![start[1]] = 0;
  const queue: [number, number][] = [start];
  const steps: GraphStep[] = [
    {
      dist: dist.map((d) => [...d]),
      frontier: [start],
      current: null,
      note: 'Start at S (distance 0)',
    },
  ];
  for (let i = 0; i < queue.length; i++) {
    const [r, c] = queue[i]!;
    if (maze[r]![c] === 'E') {
      steps.push({
        dist: dist.map((d) => [...d]),
        frontier: queue.slice(i + 1),
        current: [r, c],
        note: `Reached E in ${dist[r]![c]} steps`,
        done: true,
      });
      return steps;
    }
    for (const [dr, dc] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= h || nc >= w || maze[nr]![nc] === '#' || dist[nr]![nc] !== -1)
        continue;
      dist[nr]![nc] = dist[r]![c]! + 1;
      queue.push([nr, nc]);
    }
    steps.push({
      dist: dist.map((d) => [...d]),
      frontier: queue.slice(i + 1),
      current: [r, c],
      note: `Visit distance ${dist[r]![c]}; queue neighbours`,
    });
  }
  steps.push({
    dist: dist.map((d) => [...d]),
    frontier: [],
    current: null,
    note: 'Queue empty: E is unreachable',
    done: true,
  });
  return steps;
}
