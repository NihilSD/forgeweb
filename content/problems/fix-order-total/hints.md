## 1. Nudge

With a 25% discount, what fraction of the basket should the customer pay? What fraction does the code charge?

## 2. Approach

The code computes the discount itself, not what is left after it. The customer pays `100 - discount_percent` percent.

## 3. Pseudocode

```
total = sum of prices
return floor(total * (100 - discount) / 100)
```

## 4. Solution

Replace `discount_percent` with `(100 - discount_percent)` in the formula. Keep integer (floor) division so the result rounds down.
