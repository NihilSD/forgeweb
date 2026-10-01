function longestStreak(days) {
  let best = 0;
  let current = 0;
  for (const practised of days) {
    current = practised ? current + 1 : 0;
    best = Math.max(best, current);
  }
  return best;
}
