function firstAtLeast(builds: number[], queries: number[]): number[] {
  return queries.map((q) => {
    let lo = 0;
    let hi = builds.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (builds[mid] < q) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  });
}
