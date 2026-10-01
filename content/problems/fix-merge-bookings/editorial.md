## Idea

After sorting by start time, any booking that overlaps the current busy period must be the next one in the list, so one pass that compares with the last merged period is enough.

## Why it works

Sorted order guarantees that once a booking starts after the end of the last period, no later booking can overlap that period. `<=` merges touching bookings, as the statement requires.

## Complexity

O(n log n) for the sort, O(n) for the pass.

## Common mistakes

- Forgetting to sort (the planted bug): unsorted input splits periods that should merge.
- Using `<` instead of `<=`, which leaves touching bookings separate.
- Sorting the caller's list in place in JavaScript, which surprises callers.
