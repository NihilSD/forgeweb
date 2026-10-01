The checkout at **{{shop}}** applies a percentage discount to the whole basket.
`order_total(prices, discount_percent)` returns what the customer pays.

- `prices`: the item prices in **cents** (whole numbers, at least 0).
- `discount_percent`: a whole number from 0 to 100.

Add up the prices, take off `discount_percent` percent, and **round down** to whole cents.
Return the result in cents.

With a 25% discount the till charges only a quarter of the basket. The function has **one bug**.

## Example

```
prices = {{example_prices}}, discount_percent = {{example_discount}}
result = {{example_result}}
```
