{{shop}} sells gift bundles made of exactly **two** {{item}} orders. A customer has a voucher worth exactly **{{target}}** credits and wants to spend all of it.

Given the list `amounts` (the price of each order, in credits) and the voucher value `target`, return the positions of the two orders whose prices add up to `target`.

- Return a list `[i, j]` with `i < j` (positions start at 0).
- Each order can be used at most once.
- There is always exactly one valid pair.

## Example

```
amounts = {{example_amounts}}
target  = {{example_target}}
result  = {{example_result}}
```

## Constraints

- `2 ≤ len(amounts) ≤ {{max_n}}`
- `1 ≤ amounts[k] ≤ 1,000,000`
- Aim for a solution faster than checking every pair.
