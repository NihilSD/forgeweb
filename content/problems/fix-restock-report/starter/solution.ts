function restockReport(stock: [string, number][], threshold: number): string[] {
  const result: string[] = [];
  for (const [name, quantity] of stock) {
    if (quantity < threshold && !result.includes(name)) result.push(name);
  }
  return result.sort();
}
