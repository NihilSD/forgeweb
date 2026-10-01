# Two-way roads, but picks the route with the fewest roads (breadth-first), not the cheapest.
from collections import deque


def cheapest_cost(n, roads, start, goal):
    graph = [[] for _ in range(n)]
    for a, b, toll in roads:
        graph[a].append((b, toll))
        graph[b].append((a, toll))
    cost = {start: 0}
    queue = deque([start])
    while queue:
        town = queue.popleft()
        if town == goal:
            return cost[town]
        for nxt, toll in graph[town]:
            if nxt not in cost:
                cost[nxt] = cost[town] + toll
                queue.append(nxt)
    return -1
