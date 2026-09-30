import sys
sys.setrecursionlimit(1_000_000)


def shortest_path(maze):
    h, w = len(maze), len(maze[0])
    start = next((r, c) for r in range(h) for c in range(w) if maze[r][c] == "S")
    seen = set()

    def dfs(r, c, d):
        if not (0 <= r < h and 0 <= c < w) or maze[r][c] == "#" or (r, c) in seen:
            return -1
        if maze[r][c] == "E":
            return d
        seen.add((r, c))
        for dr, dc in ((0, 1), (-1, 0), (0, -1), (1, 0)):
            found = dfs(r + dr, c + dc, d + 1)
            if found >= 0:
                return found
        return -1

    return dfs(*start, 0)
