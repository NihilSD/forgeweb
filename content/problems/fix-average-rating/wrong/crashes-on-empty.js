// Fixes the loop but divides by zero when nothing was rated (returns NaN -> null).
function averageRating(ratings) {
  const rated = ratings.filter((r) => r !== 0);
  return rated.reduce((a, b) => a + b, 0) / rated.length;
}
