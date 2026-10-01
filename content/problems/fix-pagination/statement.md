The **{{shop}}** catalogue shows products in pages. `page_items(items, page, size)` returns the
items on one page.

- `items`: the full list of product names, in display order.
- `page`: the page number. **Pages are numbered from 1.**
- `size`: how many items fit on a page (at least 1).

Return the items on that page, in order. The last page may have fewer than `size` items. A page
after the last one is empty: return an empty list.

Customers say page 1 skips the first products and the last products never appear. The function
has **one bug**. Find and fix it.

## Example

```
items  = {{example_items}}
page   = {{example_page}}, size = {{example_size}}
result = {{example_result}}
```
