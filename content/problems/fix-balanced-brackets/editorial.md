## Idea

A stack holds the brackets that are open. Each closing bracket must match the most recently opened one. At the end, anything left on the stack was never closed.

## Why it works

The stack mirrors nesting: the innermost open bracket is always on top, so checking the top enforces correct order, and an empty stack at the end means every bracket was closed.

## Complexity

O(n) time and up to O(n) memory for the stack.

## Common mistakes

- Not checking that the stack is empty at the end (the planted bug).
- Counting brackets of each kind, which accepts crossed brackets like `([)]`.
- Popping from an empty stack, which crashes in Python or silently returns `undefined` in JavaScript.
