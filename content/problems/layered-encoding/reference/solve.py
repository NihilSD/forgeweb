import base64
import binascii
import codecs
import re

FLAG = re.compile(r'FORGE\{[0-9a-f]{24}\}')


def candidates(text):
    """Every way to undo one layer."""
    out = [text[::-1], codecs.encode(text, 'rot13')]
    try:
        out.append(bytes.fromhex(text).decode('ascii'))
    except ValueError:
        pass
    try:
        out.append(base64.b64decode(text, validate=True).decode('ascii'))
    except (ValueError, binascii.Error):
        pass
    return out


def solve(files):
    frontier = [files['wrapped.txt'].strip()]
    for _ in range(6):
        nxt = []
        for text in frontier:
            match = FLAG.search(text)
            if match:
                return match.group(0)
            nxt.extend(candidates(text))
        frontier = nxt
    return None
