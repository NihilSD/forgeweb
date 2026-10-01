def longest_streak(days):
    best = 0
    current = 0
    for practised in days:
        if practised:
            current += 1
        else:
            current = 0
        best = max(best, current)
    return best
