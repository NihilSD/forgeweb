## 1. Nudge

You need one output row per category.

## 2. Approach

GROUP BY category, and COUNT(*) counts the rows in each group.

## 3. Pseudocode

SELECT category, COUNT(*) FROM products GROUP BY category ORDER BY category

## 4. Solution

```sql
SELECT category, COUNT(*) AS n FROM products GROUP BY category ORDER BY category;
```
