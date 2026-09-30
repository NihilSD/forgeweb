def count_paths(grid):
    MOD = 1_000_000_007
    if not grid or not grid[0]:
        return 0
    w = len(grid[0])
    dp = [0] * w
    for r, row in enumerate(grid):
        for c, cell in enumerate(row):
            if cell == "#":
                dp[c] = 0
            elif r == 0 and c == 0:
                dp[c] = 1
            else:
                dp[c] = (dp[c] + (dp[c - 1] if c > 0 else 0)) % MOD
    return dp[-1]
