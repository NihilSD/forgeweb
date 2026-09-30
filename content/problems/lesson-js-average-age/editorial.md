## Idea

Reduce the array to a total, then divide by the count.

## Why it works

The average is defined as total / count for non-empty input.

## Complexity

O(n).

## Common mistakes

Dividing by zero for an empty array gives `NaN`.
