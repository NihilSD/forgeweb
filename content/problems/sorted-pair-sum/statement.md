A warehouse keeps parcel weights in a list sorted from lightest to heaviest. A courier can carry exactly **{{capacity}}** kg.

Given the sorted list `weights` (all different) and `capacity`, return the positions `[i, j]` (`i < j`) of the two parcels whose weights add up to `capacity`. There is always exactly one such pair.

```
pair_sum({{example}}, {{example_target}})  ->  {{example_result}}
```

Use the fact that the list is sorted: an O(n) solution exists without extra memory.
