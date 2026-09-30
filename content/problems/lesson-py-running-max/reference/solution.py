def running_max(numbers):
    out = []
    for n in numbers:
        out.append(n if not out else max(out[-1], n))
    return out
