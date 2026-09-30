{{person}} tracks how many minutes they spend on {{activity}} each day. They want to find their longest run of **consecutive days** where the total time stayed within a budget of **{{budget}}** minutes.

Given a list `minutes` (one non-negative number per day) and an integer `budget`, return the length of the longest contiguous run of days whose total is at most `budget`. Return `0` if no single day fits.

## Example

```
minutes = {{example_minutes}}
budget  = {{example_budget}}
result  = {{example_result}}
```

## Constraints

- `0 ≤ len(minutes) ≤ 100,000`
- `0 ≤ minutes[k] ≤ 10,000`
- `0 ≤ budget ≤ 10^9`
