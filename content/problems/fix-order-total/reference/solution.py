def order_total(prices, discount_percent):
    total = sum(prices)
    return total * (100 - discount_percent) // 100
