function mergeBookings(bookings) {
  const merged = [];
  const ordered = [...bookings].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  for (const [start, end] of ordered) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) {
      last[1] = Math.max(last[1], end);
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}
