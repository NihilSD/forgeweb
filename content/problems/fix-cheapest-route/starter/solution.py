import heapq


def cheapest_cost(n, roads, start, goal):
    graph = [[] for _ in range(n)]
    for a, b, toll in roads:
        graph[a].append((b, toll))
    best = [float('inf')] * n
    best[start] = 0
    queue = [(0, start)]
    while queue:
        cost, town = heapq.heappop(queue)
        if cost > best[town]:
            continue
        if town == goal:
            return cost
        for nxt, toll in graph[town]:
            if cost + toll < best[nxt]:
                best[nxt] = cost + toll
                heapq.heappush(queue, (best[nxt], nxt))
    return -1
