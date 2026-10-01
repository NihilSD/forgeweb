# Keeps searching, but to the right: finds the last occurrence.
def first_index(sorted_ids, target):
    lo, hi = 0, len(sorted_ids) - 1
    found = -1
    while lo <= hi:
        mid = (lo + hi) // 2
        if sorted_ids[mid] == target:
            found = mid
            lo = mid + 1
        elif sorted_ids[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return found
