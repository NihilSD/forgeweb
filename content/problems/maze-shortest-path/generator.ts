import type { GenContext, Instance, Rng } from '@forge/problem-kit';

export function bfs(maze: string[]): number {
  const h = maze.length;
  const w = maze[0]?.length ?? 0;
  let start = -1;
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) if (maze[r]![c] === 'S') start = r * w + c;
  if (start < 0) return -1;
  const dist = new Int32Array(h * w).fill(-1);
  dist[start] = 0;
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i]!;
    const r = Math.floor(cur / w);
    const c = cur % w;
    if (maze[r]![c] === 'E') return dist[cur]!;
    for (const [dr, dc] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= h || nc >= w || maze[nr]![nc] === '#') continue;
      const next = nr * w + nc;
      if (dist[next] !== -1) continue;
      dist[next] = dist[cur]! + 1;
      queue.push(next);
    }
  }
  return -1;
}

/** Open-ish maze with S top-left and E bottom-right; loops make DFS find long paths first. */
export function makeMaze(rng: Rng, h: number, w: number, walls: number): string[] {
  return Array.from({ length: h }, (_, r) =>
    Array.from({ length: w }, (_, c) =>
      r === 0 && c === 0 ? 'S' : r === h - 1 && c === w - 1 ? 'E' : rng.bool(walls) ? '#' : '.',
    ).join(''),
  );
}

export default function generate({ rng }: GenContext): Instance {
  let example = makeMaze(rng, 4, 5, 0.2);
  while (bfs(example) < 0) example = makeMaze(rng, 4, 5, 0.2);
  return {
    params: {
      place: rng.pick(['a warehouse', 'a parking garage', 'a hedge maze', 'a data centre']),
      example: JSON.stringify(example),
      example_result: bfs(example),
    },
    data: { example },
  };
}
