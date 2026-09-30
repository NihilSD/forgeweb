## 1. Nudge

Read the requirements word by word: "at most" and "total quantity across all warehouses". Does the code do both?

## 2. Approach

One bug is in the comparison. The other is that each warehouse entry is checked on its own. Add up the quantities per product first, then compare the totals.

## 3. Pseudocode

```
totals = empty map
for (name, quantity) in stock: totals[name] += quantity
return sorted(names whose total <= threshold)
```

## 4. Solution

```python
def restock_report(stock, threshold):
    totals = {}
    for name, quantity in stock:
        totals[name] = totals.get(name, 0) + quantity
    return sorted(n for n, t in totals.items() if t <= threshold)
```
