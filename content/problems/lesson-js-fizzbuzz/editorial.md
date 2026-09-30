## Idea

Check the most specific condition (multiple of 15) before the general ones.

## Why it works

Multiples of 15 are also multiples of 3 and 5, so checking 3 first would hide them.

## Complexity

O(n).

## Common mistakes

Returning numbers instead of strings, or checking 3 before 15.
