function mergeBookings(bookings) {
  const merged = [];
  for (const [start, end] of bookings) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}
