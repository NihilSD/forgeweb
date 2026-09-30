## 1. Nudge

Two steps: pick some elements, then transform them.

## 2. Approach

Use `filter` to keep even numbers (`n % 2 === 0`), then `map` to double them.

## 3. Pseudocode

numbers.filter(isEven).map(double)

## 4. Solution

```js
const doubleEvens = (numbers) => numbers.filter((n) => n % 2 === 0).map((n) => n * 2);
```
