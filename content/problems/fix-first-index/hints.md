## 1. Nudge

In the example the target appears several times. Which copy does the search land on first?

## 2. Approach

Finding the target is not enough: there may be more copies to its left. Remember the index and keep searching the left half.

## 3. Pseudocode

```
found = -1
while lo <= hi:
    mid = (lo + hi) // 2
    if ids[mid] == target: found = mid; hi = mid - 1
    elif ids[mid] < target: lo = mid + 1
    else: hi = mid - 1
return found
```

## 4. Solution

Replace `return mid` with `found = mid` and `hi = mid - 1`, start with `found = -1`, and return `found` after the loop. (`bisect.bisect_left` also works in Python if you check the result.)
