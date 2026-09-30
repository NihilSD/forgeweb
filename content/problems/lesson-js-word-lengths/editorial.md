## Idea

Split into words and build an object with one key per word.

## Why it works

Assigning the same key twice just overwrites it with the same length.

## Complexity

O(n).

## Common mistakes

`''.split(' ')` is `['']`, which adds an empty-string key unless you filter it out.
