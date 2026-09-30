function matchOrders(amounts, target) {
  const seen = new Map();
  for (let j = 0; j < amounts.length; j++) {
    const i = seen.get(target - amounts[j]);
    if (i !== undefined) return [i, j];
    seen.set(amounts[j], j);
  }
  return [];
}
