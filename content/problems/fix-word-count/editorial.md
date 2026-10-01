## Idea

Normalise each word before counting: strip the punctuation around it, then lower-case it, so every spelling of the same word lands on the same key.

## Why it works

A dictionary keyed by the normalised word counts each word in one pass. Skipping empty strings handles pieces that were only punctuation and the empty pieces JavaScript produces for leading whitespace.

## Complexity

O(n) for a text of length n.

## Common mistakes

- Lower-casing but forgetting the punctuation, so `great!` and `great` are different words.
- Splitting on a single space, which breaks on tabs, new lines and double spaces.
- Counting empty strings as words.
