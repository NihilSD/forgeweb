## Idea

Repeating-key XOR is a **known-plaintext** disaster: any predictable part of the message reveals the key bytes at that position, and because the key repeats, it reveals the key everywhere.

## Why it works

XOR is its own inverse: `(p ^ k) ^ p = k`. The 8 known header bytes give 8 key-stream bytes. A key of length 8 or less repeats inside those 8 bytes, so the stream itself tells you the key, and decrypting with it recovers the whole memo.

## Complexity

Linear in the file size, for at most 8 candidate key lengths.

## Common mistakes

- Reading the file as text: it is binary and may contain bytes that are not valid UTF-8. Open it in binary mode.
- Forgetting that the key restarts at every multiple of its length (`i % len(key)`).
- The real lesson: never design your own cipher. Use a vetted authenticated-encryption library, and never reuse a key stream.
