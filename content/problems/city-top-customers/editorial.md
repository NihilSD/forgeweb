## Idea

Aggregate first, filter second. `WHERE` runs before grouping and sees individual orders; `HAVING` runs after grouping and sees the totals.

## Why it works

Grouping by `c.id` gives one row per customer with `SUM(o.amount)` over all their orders. `HAVING` then keeps exactly the customers whose total reaches the minimum. The `LEFT JOIN` with `COALESCE` keeps customers without orders at a total of 0, which matters when the minimum is 0.

## Complexity

One pass over the join; with an index on `orders.customer_id` this is fast even for large tables.

## Common mistakes

- Filtering `o.amount >= minimum` in `WHERE`, which drops customers with many small orders.
- Using `>` instead of `>=` ("at least").
- Forgetting the secondary `ORDER BY name` for customers with the same total.
- Grouping by `name` only: two different customers can share a name.
