// Removes repeats but loses the original order.
function firstSeen(emails) {
  const byKey = new Map();
  for (const e of emails) if (!byKey.has(e.toLowerCase())) byKey.set(e.toLowerCase(), e);
  return [...byKey.values()].sort();
}
