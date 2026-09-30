## 1. Nudge

Which check has to come first so 15 becomes "FizzBuzz"?

## 2. Approach

Loop from 1 to n. Test divisibility by 15 first, then 3, then 5.

## 3. Pseudocode

for k in 1..n:
if k % 15 == 0: FizzBuzz
elif k % 3 == 0: Fizz
elif k % 5 == 0: Buzz
else: String(k)

## 4. Solution

```js
const fizzBuzz = (n) =>
  Array.from({ length: n }, (_, i) => {
    const k = i + 1;
    return k % 15 === 0 ? 'FizzBuzz' : k % 3 === 0 ? 'Fizz' : k % 5 === 0 ? 'Buzz' : String(k);
  });
```
