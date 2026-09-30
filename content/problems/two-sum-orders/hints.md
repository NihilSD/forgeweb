## 1. Nudge

For each order, you know exactly which price would complete the voucher: `target - amount`. Can you check quickly whether you've already seen that price?

## 2. Approach

Walk through the list once. Keep a dictionary from price to position for the orders you've already passed. For the current order, look up `target - amount` in the dictionary before adding the current order.

## 3. Pseudocode

```
seen = empty map
for j, amount in amounts:
    if (target - amount) in seen:
        return [seen[target - amount], j]
    seen[amount] = j
```

## 4. Solution

```python
def match_orders(amounts, target):
    seen = {}
    for j, amount in enumerate(amounts):
        if target - amount in seen:
            return [seen[target - amount], j]
        seen[amount] = j
```
