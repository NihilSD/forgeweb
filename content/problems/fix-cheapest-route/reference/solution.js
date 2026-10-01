function cheapestCost(n, roads, start, goal) {
  const graph = Array.from({ length: n }, () => []);
  for (const [a, b, toll] of roads) {
    graph[a].push([b, toll]);
    graph[b].push([a, toll]);
  }
  const best = new Array(n).fill(Infinity);
  const done = new Array(n).fill(false);
  best[start] = 0;
  for (;;) {
    let town = -1;
    for (let i = 0; i < n; i++) {
      if (!done[i] && (town === -1 || best[i] < best[town])) town = i;
    }
    if (town === -1 || best[town] === Infinity) return -1;
    if (town === goal) return best[town];
    done[town] = true;
    for (const [next, toll] of graph[town]) {
      best[next] = Math.min(best[next], best[town] + toll);
    }
  }
}
