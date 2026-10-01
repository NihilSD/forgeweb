function firstIndex(sortedIds, target) {
  let lo = 0;
  let hi = sortedIds.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sortedIds[mid] === target) {
      return mid;
    } else if (sortedIds[mid] < target) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return -1;
}
