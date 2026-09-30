## Idea

On an unweighted grid, **breadth-first search** visits cells in increasing distance from the start, so the first visit to E is along a shortest path.

## Why it works

BFS processes the queue in waves: all distance-d cells come before any distance-(d+1) cell. Marking cells when they are enqueued ensures each is assigned its smallest distance.

## Complexity

O(h × w) time and memory.

## Common mistakes

Depth-first search returns the first path it finds, which is usually longer. Marking visited cells only when dequeued lets the queue grow with duplicates.
