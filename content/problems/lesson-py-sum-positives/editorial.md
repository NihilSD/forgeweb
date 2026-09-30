## Idea

Keep a running total and add each positive number to it.

## Why it works

Every element is looked at once, and only positives change the total.

## Complexity

O(n) time, O(1) memory.

## Common mistakes

Using `>= 0` is fine here (adding 0 changes nothing), but forgetting the condition adds negatives.
