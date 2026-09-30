## 1. Nudge

You need a running total that starts at 0.

## 2. Approach

Loop over the list and add a number only when it is greater than 0.

## 3. Pseudocode

total = 0
for n in numbers:
if n > 0: total += n
return total

## 4. Solution

```python
def sum_positives(numbers):
    return sum(n for n in numbers if n > 0)
```
