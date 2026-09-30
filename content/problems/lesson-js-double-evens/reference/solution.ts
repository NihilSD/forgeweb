function doubleEvens(numbers: number[]): number[] {
  return numbers.filter((n) => n % 2 === 0).map((n) => n * 2);
}
