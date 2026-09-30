def pair_sum(weights, capacity):
    i, j = 0, len(weights) - 1
    while i < j:
        s = weights[i] + weights[j]
        if s == capacity:
            return [i, j]
        if s < capacity:
            i += 1
        else:
            j -= 1
    return []
