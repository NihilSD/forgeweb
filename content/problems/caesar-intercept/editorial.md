## Idea

A Caesar cipher replaces each letter with the one `k` positions later in the alphabet. It keeps word lengths, spacing and punctuation, which is exactly what the analyst noticed.

## Why it works

With only 25 useful keys, brute force is instant. The known prefix `FORGE{` (a _crib_) tells you when you've found the right key without reading every candidate.

## Complexity

26 decryptions of a short text: effectively instant.

## Common mistakes

- Shifting digits too: only letters were changed.
- Forgetting to wrap around from `z` to `a` (use modulo 26).
- Submitting the flag with the wrong case: letters inside the braces are lower-case hex.
