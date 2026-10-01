# Remembers addresses, but compares them with their capitals.
def first_seen(emails):
    seen = set()
    result = []
    for email in emails:
        if email not in seen:
            seen.add(email)
            result.append(email)
    return result
