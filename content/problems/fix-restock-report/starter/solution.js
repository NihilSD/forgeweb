function restockReport(stock, threshold) {
  const result = [];
  for (const [name, quantity] of stock) {
    if (quantity < threshold && !result.includes(name)) result.push(name);
  }
  return result.sort();
}
