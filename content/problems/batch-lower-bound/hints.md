## 1. Nudge

Scanning the list for every query is 10¹⁰ steps in the worst case. The list is sorted: what does that allow?

## 2. Approach

Binary search each query: keep a range [lo, hi) that must contain the answer and halve it each step.

## 3. Pseudocode

lo = 0, hi = n
while lo < hi:
mid = (lo + hi) // 2
if builds[mid] < q: lo = mid + 1
else: hi = mid
answer = lo

## 4. Solution

```python
from bisect import bisect_left

def first_at_least(builds, queries):
    return [bisect_left(builds, q) for q in queries]
```
