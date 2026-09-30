The support tool at **{{shop}}** looks up a customer's orders by name. `find_orders(orders, customer)` loads the `orders` rows (`[id, customer, total_cents]`) into an in-memory SQLite database and returns the **ids** of the orders whose `customer` exactly equals `customer`, in ascending order.

Support staff noticed two problems:

- Searching for a name with an apostrophe, like `O'Brien`, crashes the tool.
- Searching for `{{example_attack}}` returns **every** order in the shop.

Both come from the same **SQL injection** bug. Fix it so that the search value can never change the meaning of the query. Keep the function name and the return format the same.

## Example

```
customer = {{example_customer}}
result   = {{example_result}}
```
