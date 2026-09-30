## Idea

SQL injection happens when data is concatenated into the text of a query, so the database cannot tell code from data. A **parameterized query** sends the SQL and the values separately; the value is always treated as a single string, whatever it contains.

## Why it works

With `customer = ?`, the input `x' OR '1'='1` is compared literally against each name and matches nothing, and `O'Brien` works without any escaping. The same fix also blocks `UNION`, comments and stacked statements, because none of them can reach the SQL parser.

## Complexity

The same as before: one indexed or full scan of the table.

## Common mistakes

- Stripping or escaping quotes by hand: it breaks legitimate names and misses database-specific syntax (SQLite does not treat `\'` as an escape).
- Parameterizing values but still concatenating identifiers such as column names; use an allow-list for those.
- Forgetting the comma in `(customer,)`, which passes a string instead of a tuple.
