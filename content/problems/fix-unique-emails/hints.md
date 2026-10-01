## 1. Nudge

The function checks `seen` for every address. When does anything get added to `seen`?

## 2. Approach

The set of seen addresses is never filled, so every address looks new. Add the lower-cased key when you keep an address.

## 3. Pseudocode

```
for each email:
    key = lower-case email
    if key not in seen:
        add key to seen
        append email to result
```

## 4. Solution

Add `seen.add(key)` (Python) or `seen.add(key);` (JavaScript) inside the `if`, next to the append.
