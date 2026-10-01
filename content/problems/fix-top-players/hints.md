## 1. Nudge

Check the second visible test: what total does the code use for `bo`? Then look at a tie: which name comes first?

## 2. Approach

Bug one: each entry overwrites the total instead of adding to it. Bug two: `reverse=True` (or the JavaScript comparator) reverses the name order too, so ties come out Z to A.

## 3. Pseudocode

```
totals[name] += points          (start at 0)
sort by (-total, name)          (total descending, name ascending)
return the first k names
```

## 4. Solution

Python: `totals[name] = totals.get(name, 0) + points` and `key=lambda item: (-item[1], item[0])` without `reverse`. JavaScript: `totals.set(name, (totals.get(name) ?? 0) + points)` and compare names with `a[0] < b[0] ? -1 : 1` in the tie-break.
