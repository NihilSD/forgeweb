function averageRating(ratings: number[]): number {
  let total = 0;
  let count = 0;
  for (let i = 0; i < ratings.length; i++) {
    if (ratings[i] !== 0) {
      total += ratings[i];
      count++;
    }
  }
  if (count === 0) return 0;
  return total / count;
}
