## Idea

Normalise the case, then test membership in a string of vowels.

## Why it works

`text.lower()` maps every upper-case vowel to its lower-case form, so one check covers both.

## Complexity

O(n).

## Common mistakes

Forgetting upper case, or counting "y".
