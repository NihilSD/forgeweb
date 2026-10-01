**{{company}}** plans deliveries between towns. `cheapest_cost(n, roads, start, goal)` returns
the cheapest total toll for a trip.

- Towns are numbered `0` to `n - 1` (`n` is at most 300).
- `roads`: a list of `[a, b, toll]` entries. **Every road can be used in both directions.** Tolls
  are positive whole numbers. There can be several roads between the same two towns.
- Return the smallest total toll from `start` to `goal`, `0` if they are the same town, or `-1`
  if `goal` can't be reached.

Drivers say the planner picks expensive routes, or claims a town is unreachable when they can
see a road to it. The function has **one bug**.

## Example

```
n = {{example_n}}, start = {{example_start}}, goal = {{example_goal}}
roads  = {{example_roads}}
result = {{example_result}}
```
