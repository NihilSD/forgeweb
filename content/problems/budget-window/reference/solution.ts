function longestStreak(minutes: number[], budget: number): number {
  let best = 0;
  let total = 0;
  let left = 0;
  for (let right = 0; right < minutes.length; right++) {
    total += minutes[right];
    while (total > budget) total -= minutes[left++];
    best = Math.max(best, right - left + 1);
  }
  return best;
}
