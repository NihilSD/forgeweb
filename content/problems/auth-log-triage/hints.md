## 1. Nudge

Every line in `auth.log` says whether a password attempt failed or was accepted, for which user, and from which IP address. What does a password-guessing attack look like in those lines?

## 2. Approach

Count failed attempts per source IP. Two addresses stand out. Only one of them is followed by an `Accepted` line. The session opened by that user _from that IP_ is the one you want (the same user also logs in normally from their own address).

## 3. Pseudocode

```
failures = count of "Failed" lines per IP
for each "Accepted" line (user, ip):
    if failures[ip] is large: suspect = (user, ip)
find the row in sessions.csv with that user and source_ip; print its tag
```

## 4. Solution

On the command line: `grep Failed auth.log | awk '{print $(NF-3)}' | sort | uniq -c | sort -rn | head` shows the noisiest IPs, and `grep Accepted auth.log | grep <ip>` shows which one got in. Then `grep <user>,<ip> sessions.csv`.

In Python:

```python
import csv, re
from collections import Counter
fails, hits = Counter(), set()
for line in open('auth.log'):
    m = re.search(r'(Failed|Accepted) password for (?:invalid user )?(\S+) from (\S+)', line)
    if not m: continue
    if m[1] == 'Failed': fails[m[3]] += 1
    elif fails[m[3]] >= 10: hits.add((m[2], m[3]))
for row in csv.DictReader(open('sessions.csv')):
    if (row['user'], row['source_ip']) in hits: print(row['tag'])
```
