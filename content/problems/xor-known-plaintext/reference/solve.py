import base64
import re

HEADER = b'MEMO/v2\n'
FLAG = re.compile(rb'FORGE\{[0-9a-f]{24}\}')


def solve(files):
    data = base64.b64decode(files['memo.bin']['base64'])
    # Known plaintext: XOR the header with the first bytes to get the key stream.
    stream = bytes(c ^ p for c, p in zip(data, HEADER))
    for length in range(1, 9):
        key = stream[:length]
        if any(stream[i] != key[i % length] for i in range(len(stream))):
            continue
        plain = bytes(b ^ key[i % length] for i, b in enumerate(data))
        match = FLAG.search(plain)
        if match:
            return match.group(0).decode()
    return None
