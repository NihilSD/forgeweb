## 1. Nudge

The number of routes into a cell depends only on the cells above it and to its left.

## 2. Approach

Start with plain recursion: routes(r, c) = routes(r-1, c) + routes(r, c-1). It is correct but repeats work. Remember (memoize) each cell's answer, or fill a table row by row.

## 3. Pseudocode

dp[0][0] = 1 if open
for each cell (r, c):
if blocked: dp = 0
else: dp[r][c] = dp[r-1][c] + dp[r][c-1] (mod 1e9+7)

## 4. Solution

```python
def count_paths(grid):
    MOD = 10**9 + 7
    w = len(grid[0]); dp = [0] * w
    for r, row in enumerate(grid):
        for c, cell in enumerate(row):
            if cell == "#": dp[c] = 0
            elif r == c == 0: dp[c] = 1
            else: dp[c] = (dp[c] + (dp[c-1] if c else 0)) % MOD
    return dp[-1]
```
