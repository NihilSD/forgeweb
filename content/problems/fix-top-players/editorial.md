## Idea

Two independent steps: aggregate points per player with a dictionary, then sort by a compound key: total descending, then name ascending.

## Why it works

Negating the total turns "highest first" into an ascending sort, so the name can stay ascending in the same key. With `reverse=True` both parts flip, which is why ties came out backwards. Slicing the first `k` handles boards with fewer than `k` players.

## Complexity

O(n) to add up n entries, O(p log p) to sort p players.

## Common mistakes

- Overwriting instead of adding, so only the last game counts.
- Reversing the whole sort, which reverses the tie-break too.
- Using `localeCompare` for the tie-break in JavaScript when the rule is plain alphabetical order (fine here because names are lower-case ASCII, but worth knowing).
