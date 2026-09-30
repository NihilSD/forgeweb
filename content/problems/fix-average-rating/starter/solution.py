def average_rating(ratings):
    total = 0
    count = 0
    for i in range(1, len(ratings)):
        if ratings[i] != 0:
            total += ratings[i]
            count += 1
    if count == 0:
        return 0
    return total / count
