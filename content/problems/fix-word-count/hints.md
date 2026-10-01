## 1. Nudge

Look at the example: which words appear twice in the result with different capitals?

## 2. Approach

Words must be compared in one case. Convert each word to lower case after removing punctuation.

## 3. Pseudocode

```
for each piece of the text split on whitespace:
    word = piece without leading/trailing punctuation, in lower case
    if word is not empty: counts[word] += 1
```

## 4. Solution

Add `.lower()` in Python (`word = raw.strip('.,!?;:"').lower()`) or `.toLowerCase()` in JavaScript.
