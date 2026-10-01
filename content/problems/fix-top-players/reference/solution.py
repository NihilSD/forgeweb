def top_players(scores, k):
    totals = {}
    for name, points in scores:
        totals[name] = totals.get(name, 0) + points
    ranked = sorted(totals.items(), key=lambda item: (-item[1], item[0]))
    return [name for name, _ in ranked[:k]]
