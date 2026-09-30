function doubleEvens(numbers) {
  return numbers.filter((n) => n % 2 === 0 && n > 0).map((n) => n * 2);
}
