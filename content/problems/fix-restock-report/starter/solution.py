def restock_report(stock, threshold):
    result = []
    for name, quantity in stock:
        if quantity < threshold and name not in result:
            result.append(name)
    return sorted(result)
