## 1. Nudge

Check the highest grade first.

## 2. Approach

Use `if` / `elif` from the top threshold down; the first true condition wins.

## 3. Pseudocode

if score >= 90: A
elif score >= 75: B
elif score >= 50: C
else: F

## 4. Solution

```python
def grade_label(score):
    if score >= 90: return "A"
    if score >= 75: return "B"
    if score >= 50: return "C"
    return "F"
```
