## 1. Nudge

If a window of days is over budget, making it longer on the right can never help. What should you do to its left edge instead?

## 2. Approach

Use two pointers, `left` and `right`, and keep the running total of the window between them. Extend `right` one day at a time; while the total exceeds the budget, move `left` forward. After each step the window is the longest valid one ending at `right`.

## 3. Pseudocode

```
left = 0, total = 0, best = 0
for right in 0..n-1:
    total += minutes[right]
    while total > budget:
        total -= minutes[left]; left += 1
    best = max(best, right - left + 1)
```

## 4. Solution

```python
def longest_streak(minutes, budget):
    best = total = left = 0
    for right, m in enumerate(minutes):
        total += m
        while total > budget:
            total -= minutes[left]
            left += 1
        best = max(best, right - left + 1)
    return best
```
