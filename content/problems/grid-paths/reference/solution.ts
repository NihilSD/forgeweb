function countPaths(grid: string[]): number {
  const MOD = 1_000_000_007;
  if (grid.length === 0 || grid[0].length === 0) return 0;
  const w = grid[0].length;
  const dp: number[] = new Array(w).fill(0);
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < w; c++) {
      if (grid[r][c] === '#') dp[c] = 0;
      else if (r === 0 && c === 0) dp[c] = 1;
      else dp[c] = (dp[c] + (c > 0 ? dp[c - 1] : 0)) % MOD;
    }
  }
  return dp[w - 1];
}
