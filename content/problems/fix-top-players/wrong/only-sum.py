# Adds up the points, but ties still come out in reverse alphabetical order.
def top_players(scores, k):
    totals = {}
    for name, points in scores:
        totals[name] = totals.get(name, 0) + points
    ranked = sorted(totals.items(), key=lambda item: (item[1], item[0]), reverse=True)
    return [name for name, _ in ranked[:k]]
