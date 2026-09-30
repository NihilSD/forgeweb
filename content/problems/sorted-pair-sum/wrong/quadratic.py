def pair_sum(weights, capacity):
    n = len(weights)
    for i in range(n):
        for j in range(n - 1, i, -1):
            if weights[i] + weights[j] == capacity:
                return [i, j]
    return []
