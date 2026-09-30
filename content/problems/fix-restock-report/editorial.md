## Idea

The original code has two independent bugs: it uses `<` where the rule says "at most" (`<=`), and it decides per warehouse entry instead of per product total.

## Why it works

Summing into a map first gives exactly one total per product, so a product that is low in each warehouse but fine overall is no longer reported, and a product whose total equals the threshold is included.

## Complexity

O(n log n) for the final sort, O(n) to build the totals.

## Common mistakes

- Fixing only one of the two bugs. Both a threshold-equal product and a split product must be tested.
- Summing correctly but forgetting to de-duplicate names.
- Sorting the input list in place, which changes the caller's data.
