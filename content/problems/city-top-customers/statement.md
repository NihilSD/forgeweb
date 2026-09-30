The sales team at {{shop}} wants to thank its best customers in **{{city}}**.

You have two tables:

```sql
customers(id INT PRIMARY KEY, name TEXT, city TEXT)
orders(id INT PRIMARY KEY, customer_id INT REFERENCES customers(id), amount NUMERIC(10, 2))
```

Write one query that returns every customer from **{{city}}** whose **total order amount is at least {{min_total}}**.

- Columns: `name`, `total` (the sum of that customer's order amounts).
- Order by `total` from highest to lowest, then by `name` A→Z.
- Customers with no orders have a total of 0.

## Example

For the sample data in the tests, the first row might look like:

| name             | total             |
| ---------------- | ----------------- |
| {{example_name}} | {{example_total}} |
