## 1. Nudge

Look at the characters in the file. Only 0-9 and a-f? Letters, digits, `+`, `/` and `=` padding at one end? Those are strong clues for the outermost layer.

## 2. Approach

Undo one layer at a time and inspect the result after each step. If a step produces garbage, undo it and try another layer. Remember that ROT13 and reversing can be hidden between the other two.

## 3. Pseudocode

```
text = file contents
repeat:
    if text contains "FORGE{": done
    try hex-decode, base64-decode, ROT13, reverse
    keep whichever gives readable text (or search all combinations)
```

## 4. Solution

A tool like CyberChef makes this quick by hand. In Python, a small breadth-first search over the four "undo" operations finds the flag in a few thousand tries:

```python
import base64, codecs, re
def undo(t):
    out = [t[::-1], codecs.encode(t, 'rot13')]
    try: out.append(bytes.fromhex(t).decode())
    except ValueError: pass
    try: out.append(base64.b64decode(t, validate=True).decode())
    except ValueError: pass
    return out
level = [open('wrapped.txt').read().strip()]
for _ in range(6):
    for t in level:
        if m := re.search(r'FORGE\{[0-9a-f]{24}\}', t): print(m.group(0))
    level = [c for t in level for c in undo(t)]
```
