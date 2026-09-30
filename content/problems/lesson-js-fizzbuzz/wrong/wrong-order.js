function fizzBuzz(n) {
  const out = [];
  for (let k = 1; k <= n; k++) {
    out.push(k % 3 === 0 ? 'Fizz' : k % 5 === 0 ? 'Buzz' : k % 15 === 0 ? 'FizzBuzz' : String(k));
  }
  return out;
}
