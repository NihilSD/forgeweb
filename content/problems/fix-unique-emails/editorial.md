## Idea

Walk the list once, keeping a set of lower-cased addresses already kept. The first time a key appears, keep the address as written; later copies are skipped.

## Why it works

The set answers "seen before?" in O(1) on average, and because the list is processed in order, the first spelling of each address is the one kept.

## Complexity

O(n) time and memory for n addresses.

## Common mistakes

- Never adding to the set (the planted bug).
- Comparing with capitals, so `Bo@Example.com` and `bo@example.com` both stay.
- Building a set and sorting it, which loses the original order and spelling.
- Using a list instead of a set for `seen`, which is O(n²) for long lists.
