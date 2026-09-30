function pairSum(weights: number[], capacity: number): number[] {
  let i = 0;
  let j = weights.length - 1;
  while (i < j) {
    const s = weights[i] + weights[j];
    if (s === capacity) return [i, j];
    if (s < capacity) i++;
    else j--;
  }
  return [];
}
