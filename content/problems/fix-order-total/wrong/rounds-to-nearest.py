# Rounds to the nearest cent instead of down.
def order_total(prices, discount_percent):
    total = sum(prices)
    return round(total * (100 - discount_percent) / 100)
