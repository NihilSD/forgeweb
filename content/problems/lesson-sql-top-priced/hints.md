## 1. Nudge

Sort, then keep only the first few rows.

## 2. Approach

ORDER BY price DESC puts the most expensive first; LIMIT 3 keeps three.

## 3. Pseudocode

SELECT name, price FROM products ORDER BY price DESC, name LIMIT 3

## 4. Solution

```sql
SELECT name, price FROM products ORDER BY price DESC, name LIMIT 3;
```
