## Idea

This is a lower-bound search: when the middle element equals the target, it is a candidate, but an earlier copy may exist, so the search continues in the left half.

## Why it works

Every time `found` is set, the remaining range lies strictly to its left, so the last value written is the smallest index holding the target. The range halves on every step, so it stays O(log n).

## Complexity

O(log n) time, O(1) memory.

## Common mistakes

- Returning the first match found (the planted bug), which can be any copy.
- Moving `lo` instead of `hi` on a match, which finds the last copy.
- Falling back to a linear scan for repeats, which is O(n) in the worst case.
