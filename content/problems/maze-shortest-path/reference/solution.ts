function shortestPath(maze: string[]): number {
  const h = maze.length;
  const w = maze[0].length;
  let start = 0;
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) if (maze[r][c] === 'S') start = r * w + c;
  const dist = new Int32Array(h * w).fill(-1);
  dist[start] = 0;
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    const r = Math.floor(cur / w);
    const c = cur % w;
    if (maze[r][c] === 'E') return dist[cur];
    for (const [dr, dc] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= h || nc >= w || maze[nr][nc] === '#') continue;
      const next = nr * w + nc;
      if (dist[next] !== -1) continue;
      dist[next] = dist[cur] + 1;
      queue.push(next);
    }
  }
  return -1;
}
