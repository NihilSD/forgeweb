## 1. Nudge

Where does the example's longest run happen? When does the code update `best`?

## 2. Approach

The code only records the current run when it reaches a day off. A run that lasts until the last day never gets recorded.

## 3. Pseudocode

```
for each day:
    current = current + 1 if practised else 0
    best = max(best, current)
return best
```

## 4. Solution

Either update `best` on every day (as above), or keep the code and return `max(best, current)` at the end.
