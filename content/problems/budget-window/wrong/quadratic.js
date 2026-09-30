// Correct but O(n^2): too slow for 100,000 days.
function longestStreak(minutes, budget) {
  let best = 0;
  for (let i = 0; i < minutes.length; i++) {
    let total = 0;
    for (let j = i; j < minutes.length; j++) {
      total += minutes[j];
      if (total > budget) break;
      best = Math.max(best, j - i + 1);
    }
  }
  return best;
}
