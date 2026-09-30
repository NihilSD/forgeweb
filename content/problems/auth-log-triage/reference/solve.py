import csv
import io
import re
from collections import Counter

LINE = re.compile(r'(Failed|Accepted) password for (?:invalid user )?(\S+) from (\S+)')


def solve(files):
    failures = Counter()
    suspects = set()
    for line in files['auth.log'].splitlines():
        match = LINE.search(line)
        if not match:
            continue
        outcome, user, ip = match.groups()
        if outcome == 'Failed':
            failures[ip] += 1
        elif failures[ip] >= 10:
            suspects.add((user, ip))
    for row in csv.DictReader(io.StringIO(files['sessions.csv'])):
        if (row['user'], row['source_ip']) in suspects:
            return row['tag']
    return None
