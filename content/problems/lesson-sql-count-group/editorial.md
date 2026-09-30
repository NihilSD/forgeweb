## Idea

GROUP BY collapses rows with the same category into one; aggregate functions summarise each group.

## Why it works

COUNT(*) counts rows, not values in a column.

## Complexity

One scan plus grouping.

## Common mistakes

Using SUM(stock) counts items in stock, not products.
