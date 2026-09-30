## 1. Nudge

Sum first, then divide.

## 2. Approach

Use `reduce` to add up `p.age`, divide by `people.length`, and handle the empty array.

## 3. Pseudocode

if empty: return 0
return sum(ages) / count

## 4. Solution

```js
const averageAge = (ps) => (ps.length ? ps.reduce((s, p) => s + p.age, 0) / ps.length : 0);
```
