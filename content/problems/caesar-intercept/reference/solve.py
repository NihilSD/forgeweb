import re


def solve(files):
    text = files['intercept.txt']
    for k in range(26):
        plain = ''.join(
            chr((ord(c) - base - k) % 26 + base) if c.isalpha() else c
            for c in text
            for base in [65 if c.isupper() else 97]
        )
        match = re.search(r'FORGE\{[0-9a-f]{24}\}', plain)
        if match:
            return match.group(0)
    return None
