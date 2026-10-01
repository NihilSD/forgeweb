## 1. Nudge

On page 1, which index should the first item have? What index does the code compute?

## 2. Approach

Pages are numbered from 1 but list indexes start at 0. Page `p` starts after `p - 1` full pages.

## 3. Pseudocode

```
start = (page - 1) * size
return items from start up to (but not including) start + size
```

## 4. Solution

Change `start = page * size` to `start = (page - 1) * size`. Slicing already handles a short last page and pages past the end.
