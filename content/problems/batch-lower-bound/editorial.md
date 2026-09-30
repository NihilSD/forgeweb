## Idea

Each query is a **lower bound** search: the first position whose value is not less than the query. Binary search answers it in O(log n).

## Why it works

The invariant is that every index before `lo` holds a value `< q` and every index from `hi` on holds a value `>= q`. When they meet, `lo` is the first `>= q`.

## Complexity

O(q log n) time, O(1) extra memory per query.

## Common mistakes

Using `bisect_right` (first value `> q`) is wrong when the query equals a build number. A linear scan per query times out.
