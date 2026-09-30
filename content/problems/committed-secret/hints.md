## 1. Nudge

Read `backup_notes.py` from top to bottom. Everything the tool needs to protect the notes is in that file. Is anything in there that should never be in a shared repository?

## 2. Approach

The key is hard-coded in the source, and the "encryption" is a repeating-key XOR followed by Base64. XOR is its own inverse, so running the same steps backwards (Base64-decode, then XOR with the same key) recovers the notes.

## 3. Pseudocode

```
key   = the BACKUP_KEY string from the source
mixed = base64decode(notes.bak)
notes = mixed XOR key (repeating)
print the flag in notes
```

## 4. Solution

```python
import base64
key = b'...'  # copy BACKUP_KEY from backup_notes.py
mixed = base64.b64decode(open('notes.bak').read())
print(bytes(b ^ key[i % len(key)] for i, b in enumerate(mixed)).decode())
```
