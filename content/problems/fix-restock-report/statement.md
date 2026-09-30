{{company}} runs several warehouses. Every evening a script lists the products that need restocking.

`restock_report(stock, threshold)` receives:

- `stock`: a list of `[name, quantity]` pairs, **one per warehouse**. The same product can appear several times.
- `threshold`: an integer.

A product needs restocking when its **total quantity across all warehouses is at most** `threshold`. Return the names of those products, **sorted alphabetically**, each name once.

The warehouse team says the report is wrong: it misses some products and lists others it shouldn't. The function has **two bugs**. Find and fix both.

## Example

```
stock     = {{example_stock}}
threshold = {{example_threshold}}
result    = {{example_result}}
```
