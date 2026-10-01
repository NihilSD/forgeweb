## Idea

Page numbers start at 1 for people and at 0 for code. Page `p` begins after `(p - 1)` full pages, so its first index is `(p - 1) * size`.

## Why it works

A slice `items[start:start + size]` takes at most `size` items and simply stops at the end of the list, so a short last page and a page past the end (an empty slice) need no special case.

## Complexity

O(size) for the slice.

## Common mistakes

- Using `page * size`, which treats page numbers as starting at 0 and skips a page.
- Cutting the slice at `start + size - 1`: slice ends are exclusive.
- Adding a special case for the last page that isn't needed.
