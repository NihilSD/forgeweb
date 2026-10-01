def longest_streak(days):
    best = 0
    current = 0
    for practised in days:
        if practised:
            current += 1
        else:
            best = max(best, current)
            current = 0
    return best
