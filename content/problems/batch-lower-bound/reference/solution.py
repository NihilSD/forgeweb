from bisect import bisect_left


def first_at_least(builds, queries):
    return [bisect_left(builds, q) for q in queries]
