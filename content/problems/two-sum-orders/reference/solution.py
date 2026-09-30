def match_orders(amounts, target):
    seen = {}
    for j, amount in enumerate(amounts):
        need = target - amount
        if need in seen:
            return [seen[need], j]
        seen[amount] = j
    return []
