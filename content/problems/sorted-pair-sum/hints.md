## 1. Nudge

Look at the smallest and the largest weight. If their sum is too small, which one can never be part of the answer?

## 2. Approach

Keep two pointers, one at each end. Move the left one right when the sum is too small, the right one left when it is too big.

## 3. Pseudocode

i = 0, j = n - 1
while i < j:
s = w[i] + w[j]
if s == target: return [i, j]
if s < target: i += 1 else: j -= 1

## 4. Solution

```python
def pair_sum(weights, capacity):
    i, j = 0, len(weights) - 1
    while i < j:
        s = weights[i] + weights[j]
        if s == capacity: return [i, j]
        if s < capacity: i += 1
        else: j -= 1
```
