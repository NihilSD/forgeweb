## Idea

Chain `filter` and `map`: each returns a new array, so the input is untouched.

## Why it works

`n % 2 === 0` is true for every even integer, including negatives and zero.

## Complexity

O(n).

## Common mistakes

Using `n % 2 === 1` to find odds fails for negative numbers (`-3 % 2 === -1`).
