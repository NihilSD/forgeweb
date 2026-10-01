The **{{system}}** archive keeps ticket ids in a sorted list, and the same id can appear several
times (one row per update). `first_index(sorted_ids, target)` finds where a ticket's history
starts.

- `sorted_ids`: integers in ascending order, possibly with repeats. It can be empty.
- Return the index of the **first** occurrence of `target`, or `-1` if it isn't there.
- The list can be long: keep the search O(log n).

For tickets with several updates, the history sometimes starts in the middle. The function has
**one bug**.

## Example

```
sorted_ids = {{example_ids}}, target = {{example_target}}
result     = {{example_result}}
```
