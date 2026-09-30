## Idea

The loop starts at index 1, so the first rating is never counted. This is a classic **off-by-one** error.

## Why it works

Starting at index 0 visits every rating exactly once. Everything else in the function (skipping zeros, guarding against an empty count) was already correct.

## Complexity

O(n) time, O(1) extra memory.

## Common mistakes

- Rewriting the function and accidentally counting skipped (0) ratings.
- Removing the `count == 0` guard, which divides by zero when nothing was rated.
- Only testing with lists whose first rating happens to equal the average, which hides the bug.
