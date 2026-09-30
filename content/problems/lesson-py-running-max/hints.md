## 1. Nudge

Remember the biggest value seen so far.

## 2. Approach

Walk the list once; after each element, append the current maximum.

## 3. Pseudocode

best = None
for n in numbers:
best = n if best is None else max(best, n)
append best

## 4. Solution

```python
def running_max(numbers):
    out = []
    for n in numbers:
        out.append(n if not out else max(out[-1], n))
    return out
```
