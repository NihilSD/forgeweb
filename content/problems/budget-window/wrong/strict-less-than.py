# Common mistake: treats "within budget" as strictly less than the budget.
def longest_streak(minutes, budget):
    best = total = left = 0
    for right, m in enumerate(minutes):
        total += m
        while left <= right and total >= budget:
            total -= minutes[left]
            left += 1
        best = max(best, right - left + 1)
    return best
