## 1. Nudge

Depth-first search finds _a_ path, not necessarily the shortest one. Which search explores cells in order of distance?

## 2. Approach

Use breadth-first search with a queue: visit all cells 1 step away, then 2 steps away, and so on. The first time you reach E, that distance is the minimum.

## 3. Pseudocode

queue = [S]; dist[S] = 0
while queue:
cell = queue.pop_front()
if cell is E: return dist[cell]
for each open, unvisited neighbour n:
dist[n] = dist[cell] + 1; queue.push(n)
return -1

## 4. Solution

```python
from collections import deque

def shortest_path(maze):
    h, w = len(maze), len(maze[0])
    s = next((r, c) for r in range(h) for c in range(w) if maze[r][c] == "S")
    dist = {s: 0}; q = deque([s])
    while q:
        r, c = q.popleft()
        if maze[r][c] == "E": return dist[(r, c)]
        for dr, dc in ((1,0),(-1,0),(0,1),(0,-1)):
            n = (r+dr, c+dc)
            if 0 <= n[0] < h and 0 <= n[1] < w and maze[n[0]][n[1]] != "#" and n not in dist:
                dist[n] = dist[(r, c)] + 1; q.append(n)
    return -1
```
