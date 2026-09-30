## 1. Nudge

Compare the two routes in `invoices.js`. The list route only returns the signed-in customer's invoices. What does the single-invoice route check before it responds?

## 2. Approach

The `/api/invoices/:id` route checks that someone is logged in, but never checks that the invoice belongs to them: an **insecure direct object reference** (IDOR). In the log, look for a successful (`200`) request for an invoice id whose owner in `invoices.json` is a different user.

## 3. Pseudocode

```
owner_of = { invoice.id: invoice for invoice in invoices.json }
for each log entry with status 200 and path /api/invoices/<id>:
    if owner_of[id].owner != entry.user: print owner_of[id].reference
```

## 4. Solution

```python
import json, re
invoices = {i['id']: i for i in json.load(open('invoices.json'))}
for line in open('access.log'):
    e = json.loads(line)
    m = re.fullmatch(r'/api/invoices/(\d+)', e['path'])
    if m and e['status'] == 200 and invoices[int(m[1])]['owner'] != e['user']:
        print(invoices[int(m[1])]['reference'])
```
