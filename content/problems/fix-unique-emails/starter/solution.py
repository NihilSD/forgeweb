def first_seen(emails):
    seen = set()
    result = []
    for email in emails:
        key = email.lower()
        if key not in seen:
            result.append(email)
    return result
