## Idea

**Recursion** gives the right formula; **memoization / dynamic programming** makes it fast. Every route enters a cell from the left or from above.

## Why it works

Routes to (r, c) split cleanly into those whose last step came from above and those from the left, so their counts add. Blocked cells have 0 routes.

## Complexity

O(h × w) time; a single row of the table is enough, so O(w) memory.

## Common mistakes

Plain recursion re-explores the same cells exponentially many times and times out. Forgetting the modulo overflows in JavaScript.
