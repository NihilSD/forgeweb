## Idea

A discount of `d` percent leaves `100 - d` percent to pay. Multiply first, then divide by 100 with floor division, so the result is whole cents rounded down.

## Why it works

Working in integer cents avoids floating-point surprises: `total * (100 - d)` is exact, and floor division by 100 rounds down exactly as the statement asks.

## Complexity

O(n) to add up n prices.

## Common mistakes

- Charging the discount instead of the remainder.
- Rounding to the nearest cent (`round`) instead of down.
- Converting to euros as floats and back, which can lose a cent.
