function orderTotal(prices, discountPercent) {
  const total = prices.reduce((sum, p) => sum + p, 0);
  return Math.floor((total * (100 - discountPercent)) / 100);
}
