## 1. Nudge

Run the attack example by hand. After normalising, where does the path end up? What does the function check before returning it?

## 2. Approach

The normalisation is already correct. What is missing is a final check that the result is still inside the upload folder. Be careful: `/srv/uploads-archive` starts with the text `/srv/uploads` too.

## 3. Pseudocode

```
path = normalised join of BASE and name   (already done)
if path starts with BASE + "/": return path
else: return null
```

## 4. Solution

Replace the last line with `return path if path.startswith(BASE + '/') else None` in Python, or `return path.startsWith(BASE + '/') ? path : null;` in JavaScript.
