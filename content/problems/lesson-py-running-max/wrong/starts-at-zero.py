def running_max(numbers):
    best = 0
    out = []
    for n in numbers:
        best = max(best, n)
        out.append(best)
    return out
