The **{{game}}** leaderboard ranks players by their total points. `top_players(scores, k)`
returns the top of the board.

- `scores`: a list of `[name, points]` entries, one per game played. A player usually has
  **several entries**; their total is the sum.
- Rank by total, highest first. **Ties** are broken by name in alphabetical order.
- Return the names of the top `k` players (all players if there are fewer than `k`).

Names are lower-case ASCII letters. Points are whole numbers (they can be 0).

Players complain that their scores aren't adding up, and that ties come out in the wrong order.
The function has **two bugs**.

## Example

```
scores = {{example_scores}}, k = {{example_k}}
result = {{example_result}}
```
