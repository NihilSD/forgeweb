## Idea

The maximum of a prefix is the maximum of the previous prefix and the new element.

## Why it works

Each step extends the previous answer by one element.

## Complexity

O(n).

## Common mistakes

Starting the maximum at 0 breaks lists of negative numbers.
