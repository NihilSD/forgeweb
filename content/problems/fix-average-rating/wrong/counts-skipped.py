# Fixes the loop but counts skipped (0) ratings in the average.
def average_rating(ratings):
    if not ratings:
        return 0
    return sum(ratings) / len(ratings)
