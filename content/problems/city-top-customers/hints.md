## 1. Nudge

The condition is about each customer's **total**, not about single orders. Which SQL clause filters after grouping?

## 2. Approach

Join customers to their orders, keep only customers from the city, group by customer, and filter the groups with `HAVING SUM(amount) >= ...`. Sort by the total, then by name.

## 3. Pseudocode

```
SELECT name, SUM(amount) AS total
FROM customers JOIN orders
WHERE city = <city>
GROUP BY customer
HAVING total >= <minimum>
ORDER BY total DESC, name ASC
```

## 4. Solution

```sql
SELECT c.name, COALESCE(SUM(o.amount), 0) AS total
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
WHERE c.city = '<city>'
GROUP BY c.id, c.name
HAVING COALESCE(SUM(o.amount), 0) >= <minimum>
ORDER BY total DESC, c.name ASC;
```
