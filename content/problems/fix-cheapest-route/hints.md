## 1. Nudge

Try the second visible test: the only road is `[1, 0, 7]`. Can the planner go from town 0 to town 1?

## 2. Approach

The statement says every road works in both directions, but the graph only stores each road from `a` to `b`. The search itself (Dijkstra) is fine.

## 3. Pseudocode

```
for each road (a, b, toll):
    add b to the neighbours of a
    add a to the neighbours of b
```

## 4. Solution

Add `graph[b].append((a, toll))` (Python) or `graph[b].push([a, toll]);` (JavaScript) next to the existing line.
