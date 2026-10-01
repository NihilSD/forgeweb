## 1. Nudge

Run the second visible test by hand. In what order does the loop see the bookings?

## 2. Approach

The merging step only compares each booking with the last merged period. That only works if bookings are processed in start-time order.

## 3. Pseudocode

```
for each (start, end) in bookings sorted by start:
    if merged is not empty and start <= end of last merged period:
        extend the last period to max(its end, end)
    else:
        add a new period [start, end]
```

## 4. Solution

Loop over `sorted(bookings)` in Python, or over `[...bookings].sort((a, b) => a[0] - b[0] || a[1] - b[1])` in JavaScript (copy first: `sort` changes the array in place).
