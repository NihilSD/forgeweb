function matchOrders(amounts: number[], target: number): number[] {
  const seen = new Map<number, number>();
  for (let j = 0; j < amounts.length; j++) {
    const i = seen.get(target - amounts[j]);
    if (i !== undefined) return [i, j];
    seen.set(amounts[j], j);
  }
  return [];
}
