def first_seen(emails):
    seen = set()
    result = []
    for email in emails:
        key = email.lower()
        if key not in seen:
            seen.add(key)
            result.append(email)
    return result
