from bisect import bisect_right


def first_at_least(builds, queries):
    return [bisect_right(builds, q) for q in queries]
