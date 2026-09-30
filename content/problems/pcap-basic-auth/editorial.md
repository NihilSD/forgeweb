## Idea

HTTP Basic authentication sends `username:password` Base64-encoded in every request. Base64 is an encoding, not encryption, so over plain HTTP anyone on the network path can read the credentials.

## Why it works

Each attempt uses its own TCP connection, so pairing a request with the response on the same client port tells you which credentials the server accepted. The rejected attempts use look-alike flags on purpose: you have to use the server's answer, not just the first password you see.

## Complexity

One pass over the packets.

## Common mistakes

- Submitting the first password in the capture: the early attempts were rejected.
- Decoding the whole header value including the username: the flag is only the part after the first colon.
- The fix in real life: serve admin pages only over HTTPS (TLS), prefer session or token authentication over Basic auth, and never reuse passwords that have crossed a network in clear text.
