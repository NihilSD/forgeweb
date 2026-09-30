import json
import re


def solve(files):
    owners = {inv['id']: inv for inv in json.loads(files['invoices.json'])}
    for line in files['access.log'].splitlines():
        entry = json.loads(line)
        match = re.fullmatch(r'/api/invoices/(\d+)', entry['path'])
        if not match or entry['status'] != 200:
            continue
        invoice = owners.get(int(match.group(1)))
        if invoice and invoice['owner'] != entry['user']:
            return invoice['reference']
    return None
