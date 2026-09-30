## Idea

Each encoding is a reversible, **keyless** transformation. Stacking several of them looks scrambled but adds no secrecy: undo them in reverse order and the note comes back.

## Why it works

Encodings leave fingerprints. Hex uses only `0-9a-f` and has even length. Base64 uses a 64-character alphabet, a length that is a multiple of 4, and often `=` padding. When a Base64 string has been reversed, the padding appears at the _start_, and ROT13 changes letter case patterns but not the alphabet. Recognising those fingerprints tells you which layer to undo next.

## Complexity

At most 4 layers and 4 possible undo steps: a brute-force search explores at most a few hundred strings.

## Common mistakes

- Treating encoding as protection. If there is no key, there is no secret: use real encryption (for example an authenticated cipher from a vetted library) for confidential data.
- Decoding hex that has been reversed without reversing it first: the bytes come out swapped.
- Stopping when the text looks readable but still has ROT13 applied: `SBETR{` is `FORGE{` in ROT13.
