## 1. Nudge

Look at how the `SELECT` statement is built. What happens to the query text when `customer` contains a `'`?

## 2. Approach

The customer name is pasted into the SQL string with an f-string, so a quote in the name ends the string literal and the rest is read as SQL. Use a **parameterized query**: put a `?` placeholder in the SQL and pass the value separately.

## 3. Pseudocode

```
rows = db.execute("SELECT id FROM orders WHERE customer = ? ORDER BY id", (customer,))
return [id for (id,) in rows]
```

## 4. Solution

Replace the f-string query with `db.execute('SELECT id FROM orders WHERE customer = ? ORDER BY id', (customer,)).fetchall()`. Note the trailing comma: the parameters must be a tuple.
