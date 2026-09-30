## 1. Nudge

Upper-case vowels count too.

## 2. Approach

Lower-case the text first, then check each character against "aeiou".

## 3. Pseudocode

count = 0
for c in text.lower():
if c in "aeiou": count += 1

## 4. Solution

```python
def count_vowels(text):
    return sum(c in "aeiou" for c in text.lower())
```
