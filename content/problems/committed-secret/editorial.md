## Idea

There are two bugs. The serious one is a **secret committed to source control**: anyone who can read the repository (every contractor, and anyone who ever clones it) has the key. The second is **home-made cryptography**: repeating-key XOR is not encryption, and Base64 adds nothing.

## Why it works

Because XOR is reversible with the same key, knowing the key means knowing the notes. Even without the key, repeating-key XOR falls to known-plaintext and frequency analysis (see _The Memo Vault_).

## Complexity

Linear in the size of the backup.

## Common mistakes

How to fix it:

- Keep secrets out of code: load them at runtime from a secret manager or environment, and add secret scanning (for example gitleaks) to CI.
- Once a secret has been committed, **rotate it**. Deleting it in a later commit does not remove it from history.
- Use a vetted authenticated-encryption primitive (for example AES-GCM or libsodium's secretbox) with a random nonce, instead of inventing a cipher.
