    **{{org}}** built an in-house "memo vault". It encrypts each memo by XOR-ing it with a short secret key that repeats over the whole file. The key is between 1 and 8 bytes long.

    Every memo the vault writes starts with the same 8-byte header: `{{header}}` (the last character is a newline).

    Download `memo.bin`, recover the key, decrypt the memo and submit the flag inside it. Flags look like `FORGE{...}`.

> This is a practice challenge built for Forge. Read the [challenge rules](/security/rules): only attack challenges on Forge itself.
