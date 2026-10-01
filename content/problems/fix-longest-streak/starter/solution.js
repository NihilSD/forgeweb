function longestStreak(days) {
  let best = 0;
  let current = 0;
  for (const practised of days) {
    if (practised) {
      current += 1;
    } else {
      best = Math.max(best, current);
      current = 0;
    }
  }
  return best;
}
