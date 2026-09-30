## Idea

Checking every pair takes O(n²) time, which is too slow for 50,000 orders. Instead, remember every price you've seen and its position. For each new order, the partner price is fixed (`target - amount`), so one dictionary lookup tells you whether the partner came earlier.

## Why it works

The valid pair is `(i, j)` with `i < j`. When the loop reaches `j`, order `i` is already in the dictionary, so the lookup finds it. Checking the dictionary _before_ inserting the current order guarantees an order never pairs with itself.

## Complexity

O(n) time and O(n) extra memory: one pass, constant-time dictionary operations.

## Common mistakes

- Inserting the current order before the lookup, so `amount * 2 == target` matches the order with itself.
- Returning `[j, i]` instead of `[i, j]`.
- Using nested loops, which times out on large inputs.
