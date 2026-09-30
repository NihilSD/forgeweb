// Merges warehouses but keeps the strict comparison.
function restockReport(stock, threshold) {
  const totals = new Map();
  for (const [name, quantity] of stock) totals.set(name, (totals.get(name) ?? 0) + quantity);
  return [...totals]
    .filter(([, total]) => total < threshold)
    .map(([name]) => name)
    .sort();
}
