# Counts all practice days, not the longest run.
def longest_streak(days):
    return sum(1 for d in days if d)
