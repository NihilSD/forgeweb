The meeting room at **{{office}}** shows when it is busy. `merge_bookings(bookings)` merges
bookings into busy periods.

- `bookings`: a list of `[start, end]` pairs in minutes after midnight, with `start < end`. The
  list is in the order bookings were made, **not** sorted.
- Bookings that overlap or touch (one ends exactly when the next starts) merge into one period.

Return the busy periods as `[start, end]` pairs, sorted by start time.

Some busy periods are shown twice, and some overlaps are missed. The function has **one bug**.

## Example

```
bookings = {{example_bookings}}
result   = {{example_result}}
```
