function fizzBuzz(n: number): string[] {
  const out: string[] = [];
  for (let k = 1; k <= n; k++) {
    out.push(k % 15 === 0 ? 'FizzBuzz' : k % 3 === 0 ? 'Fizz' : k % 5 === 0 ? 'Buzz' : String(k));
  }
  return out;
}
