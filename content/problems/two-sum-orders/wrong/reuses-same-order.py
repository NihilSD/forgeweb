# Common mistake: stores the amount before checking, so an order can pair with itself.
def match_orders(amounts, target):
    seen = {}
    for j, amount in enumerate(amounts):
        seen[amount] = j
        need = target - amount
        if need in seen:
            return sorted([seen[need], j])
    return []
