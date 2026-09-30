import base64
import re


def solve(files):
    key = re.search(r'BACKUP_KEY = "([^"]+)"', files['backup_notes.py']).group(1).encode()
    mixed = base64.b64decode(files['notes.bak'].strip())
    notes = bytes(b ^ key[i % len(key)] for i, b in enumerate(mixed)).decode()
    return re.search(r'FORGE\{[0-9a-f]{24}\}', notes).group(0)
