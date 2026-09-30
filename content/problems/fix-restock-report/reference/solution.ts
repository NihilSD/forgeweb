function restockReport(stock: [string, number][], threshold: number): string[] {
  const totals = new Map<string, number>();
  for (const [name, quantity] of stock) totals.set(name, (totals.get(name) ?? 0) + quantity);
  return [...totals]
    .filter(([, total]) => total <= threshold)
    .map(([name]) => name)
    .sort();
}
