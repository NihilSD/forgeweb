## 1. Nudge

Compare the example's expected result with what the function returns. Which rating seems to be missing from the calculation?

## 2. Approach

Look closely at where the loop starts. Lists are indexed from 0.

## 3. Pseudocode

```
for every index i from 0 to len(ratings) - 1:
    if ratings[i] is not 0: add it to total, count it
return total / count, or 0 when count is 0
```

## 4. Solution

Change `range(1, len(ratings))` to `range(len(ratings))` (or `let i = 1` to `let i = 0` in JavaScript/TypeScript).
