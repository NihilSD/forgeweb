## 1. Nudge

XOR has a useful property: if `cipher = plain XOR key`, then `key = cipher XOR plain`. Which part of the plaintext do you already know?

## 2. Approach

XOR the first 8 bytes of the file with the known header. The result is the first 8 bytes of the repeating key stream. Look for the shortest length at which it repeats, then decrypt the whole file with that key.

## 3. Pseudocode

```
stream = first 8 bytes of file XOR "MEMO/v2\n"
for length in 1..8:
    key = stream[0:length]
    if stream repeats with this period:
        plain = file XOR key (repeating)
        if "FORGE{" in plain: done
```

## 4. Solution

```python
data = open('memo.bin', 'rb').read()
stream = bytes(c ^ p for c, p in zip(data, b'MEMO/v2\n'))
for n in range(1, 9):
    key = stream[:n]
    plain = bytes(b ^ key[i % n] for i, b in enumerate(data))
    if b'FORGE{' in plain:
        print(plain.decode())
        break
```
