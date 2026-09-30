## 1. Nudge

`split` turns a sentence into an array of words.

## 2. Approach

Split on ' ', then loop and assign `out[word] = word.length`.

## 3. Pseudocode

out = {}
for word of sentence.split(' '): if word: out[word] = word.length

## 4. Solution

```js
const wordLengths = (s) =>
  Object.fromEntries(
    s
      .split(' ')
      .filter(Boolean)
      .map((w) => [w, w.length]),
  );
```
