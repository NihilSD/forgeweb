## Idea

This is the **two pointers** pattern: start at both ends of a sorted list and move inwards.

## Why it works

If `w[i] + w[j]` is too small, `w[i]` plus any element at or left of `j` is also too small, so `i` can be discarded. The symmetric argument discards `j`. The answer is never skipped.

## Complexity

O(n) time, O(1) extra memory.

## Common mistakes

Checking every pair (O(n²)) times out on 100,000 parcels. Using a hash map also works but ignores the sortedness.
