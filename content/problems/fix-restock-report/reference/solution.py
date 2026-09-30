def restock_report(stock, threshold):
    totals = {}
    for name, quantity in stock:
        totals[name] = totals.get(name, 0) + quantity
    return sorted(name for name, total in totals.items() if total <= threshold)
