## 1. Nudge

Only letters changed; spaces, digits and punctuation stayed where they were. Which classic cipher shifts each letter by the same amount?

## 2. Approach

It's a Caesar cipher. There are only 25 possible shifts, so try them all and look for readable English, or for the text `FORGE{`.

## 3. Pseudocode

```
for k in 1..25:
    plain = shift every letter back by k
    if "FORGE{" in plain: print the flag
```

## 4. Solution

```python
text = open('intercept.txt').read()
for k in range(26):
    plain = ''.join(chr((ord(c) - b - k) % 26 + b) if c.isalpha() else c
                    for c in text for b in [65 if c.isupper() else 97])
    if 'FORGE{' in plain:
        print(plain)
```
