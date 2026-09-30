## Idea

Pick columns explicitly and add an ORDER BY: without one, SQL returns rows in no guaranteed order.

## Why it works

ORDER BY name sorts text alphabetically.

## Complexity

A full table scan plus a sort.

## Common mistakes

Relying on insertion order, or selecting extra columns.
