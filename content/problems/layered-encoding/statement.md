    A developer at **{{org}}** "secured" a delivery note by running it through several common encodings, one after another, and pasted the result into a chat. Encoding is not encryption: anyone who recognises the layers can undo them.

    Download `wrapped.txt`, peel off every layer, and submit the flag inside the note. Flags look like `FORGE{...}`.

    The layers are some mix of: Base64, hexadecimal, ROT13 and reversing the text. Each one was applied exactly once.

> This is a practice challenge built for Forge. Read the [challenge rules](/security/rules): only attack challenges on Forge itself.
