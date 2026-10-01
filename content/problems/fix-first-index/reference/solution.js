function firstIndex(sortedIds, target) {
  let lo = 0;
  let hi = sortedIds.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (sortedIds[mid] === target) {
      found = mid;
      hi = mid - 1;
    } else if (sortedIds[mid] < target) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}
