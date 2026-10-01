## Idea

Track the length of the current run and the best run seen so far. The best must also be checked after the last day, because a run can end with the list instead of with a day off.

## Why it works

Updating `best` after every day makes the loop correct whatever the last value is: at every point `best` is the longest run within the days seen so far.

## Complexity

O(n) for n days, O(1) extra memory.

## Common mistakes

- Updating the best only when a run breaks (the planted bug).
- Counting all practice days instead of consecutive ones.
- Forgetting the empty list, where the answer is 0.
