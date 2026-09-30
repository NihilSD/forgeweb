## Idea

Test the thresholds from highest to lowest so each branch only needs a lower bound.

## Why it works

A score reaching a branch has already failed every higher threshold.

## Complexity

O(1).

## Common mistakes

Using `>` instead of `>=` puts exactly 90, 75 and 50 in the wrong band.
