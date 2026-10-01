## Idea

Build an undirected graph (each road added to both towns' neighbour lists), then run Dijkstra's algorithm from `start` and stop when `goal` is settled.

## Why it works

Tolls are positive, so the town with the smallest known cost can't get cheaper later: Dijkstra settles towns in order of cost. With roads stored one way only, routes that use a road "backwards" disappear, which is why the planner chose pricier routes or none.

## Complexity

O((n + m) log n) with a heap (Python), or O(n² + m) with the array scan (JavaScript), for n towns and m roads.

## Common mistakes

- Treating two-way roads as one-way (the planted bug).
- Breadth-first search, which finds the route with the fewest roads, not the lowest toll.
- Forgetting the case where start equals goal (the answer is 0).
