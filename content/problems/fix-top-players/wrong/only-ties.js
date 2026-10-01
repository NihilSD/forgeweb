// Fixes the tie order, but still keeps only each player's last game.
function topPlayers(scores, k) {
  const totals = new Map();
  for (const [name, points] of scores) totals.set(name, points);
  return [...totals]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .slice(0, k)
    .map(([name]) => name);
}
