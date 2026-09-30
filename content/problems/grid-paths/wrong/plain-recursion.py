import sys
sys.setrecursionlimit(10000)


def count_paths(grid):
    h, w = len(grid), len(grid[0])

    def go(r, c):
        if r >= h or c >= w or grid[r][c] == "#":
            return 0
        if r == h - 1 and c == w - 1:
            return 1
        return (go(r + 1, c) + go(r, c + 1)) % 1_000_000_007

    return go(0, 0)
