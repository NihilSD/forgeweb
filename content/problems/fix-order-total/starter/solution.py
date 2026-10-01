def order_total(prices, discount_percent):
    total = sum(prices)
    return total * discount_percent // 100
