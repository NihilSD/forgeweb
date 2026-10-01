import type { GenContext, Instance, Rng } from '@forge/problem-kit';

export type Road = [number, number, number];

export function cheapest(n: number, roads: Road[], start: number, goal: number): number {
  const graph: [number, number][][] = Array.from({ length: n }, () => []);
  for (const [a, b, w] of roads) {
    graph[a]!.push([b, w]);
    graph[b]!.push([a, w]);
  }
  const best = Array<number>(n).fill(Infinity);
  const done = Array<boolean>(n).fill(false);
  best[start] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && (u === -1 || best[i]! < best[u]!)) u = i;
    if (u === -1 || best[u] === Infinity) return -1;
    if (u === goal) return best[u]!;
    done[u] = true;
    for (const [v, w] of graph[u]!) best[v] = Math.min(best[v]!, best[u]! + w);
  }
}

export function randomRoads(rng: Rng, n: number, m: number): Road[] {
  const roads: Road[] = [];
  for (let i = 1; i < n; i++) roads.push([i, rng.int(0, i - 1), rng.int(1, 50)]);
  for (let i = n - 1; i < m; i++)
    roads.push([rng.int(0, n - 1), rng.int(0, n - 1), rng.int(1, 50)]);
  return rng.shuffle(roads).map(([a, b, w]) => (rng.bool() ? [a, b, w] : [b, a, w]) as Road);
}

/** The cheap route uses a road written "backwards"; a pricier direct road is written forwards. */
export function exampleTrip(rng: Rng) {
  const n = rng.int(5, 6);
  const path = rng.shuffle(Array.from({ length: n }, (_, i) => i)).slice(0, 4);
  const tolls = path.slice(1).map(() => rng.int(2, 9));
  const roads: Road[] = path.slice(1).map((b, i) => {
    const a = path[i]!;
    return (i === 1 ? [b, a, tolls[i]!] : [a, b, tolls[i]!]) as Road;
  });
  const sum = tolls.reduce((x, y) => x + y, 0);
  roads.push([path[0]!, path[3]!, sum + rng.int(5, 20)]);
  return { n, roads: rng.shuffle(roads), start: path[0]!, goal: path[3]! };
}

export default function generate({ rng }: GenContext): Instance {
  const trip = exampleTrip(rng);
  return {
    params: {
      company: rng.pick(['Swift Freight', 'Danube Haulage', 'Kestrel Logistics']),
      example_n: trip.n,
      example_start: trip.start,
      example_goal: trip.goal,
      example_roads: JSON.stringify(trip.roads),
      example_result: cheapest(trip.n, trip.roads, trip.start, trip.goal),
    },
    data: trip,
  };
}
