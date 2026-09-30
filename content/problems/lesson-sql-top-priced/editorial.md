## Idea

Sort descending and take the first rows with LIMIT.

## Why it works

After sorting, the top-N rows are exactly the N largest.

## Complexity

A sort (or a top-N heap inside the database).

## Common mistakes

Forgetting DESC returns the cheapest products.
