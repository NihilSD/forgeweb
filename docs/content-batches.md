# Launch content batches (phase L11)

Target mix (spec): Algorithms 60, Debugging 35, SQL 30, Security 25, with 40 competitive-enabled
templates. Every package starts as `review: needs-review`. A batch is done when a human has read
and solved each problem and set `review: approved` (see the checklist in
[content-style.md](content-style.md)).

| Track               | Listed now | Target |
| ------------------- | ---------- | ------ |
| Algorithms          | 6          | 60     |
| Debugging           | 12         | 35     |
| SQL                 | 1          | 30     |
| Security            | 10         | 25     |
| Competitive-enabled | 5          | 40     |

## Batch 1: Debugging (awaiting review)

All fix-code, Python and JavaScript, 4-level hints and an editorial each, validated on 50 seeds
in the real sandboxes.

| Package                 | Difficulty | Bug(s)                                                          | Mode     |
| ----------------------- | ---------- | --------------------------------------------------------------- | -------- |
| `fix-pagination`        | easy       | page numbers treated as 0-based                                 | practice |
| `fix-word-count`        | easy       | counting is case-sensitive                                      | practice |
| `fix-order-total`       | easy       | charges the discount instead of the remainder                   | practice |
| `fix-longest-streak`    | easy       | a run that lasts to the last day is never recorded              | practice |
| `fix-merge-bookings`    | medium     | merges without sorting first                                    | both     |
| `fix-first-index`       | medium     | binary search returns any copy, not the first                   | both     |
| `fix-unique-emails`     | medium     | the "seen" set is never filled                                  | practice |
| `fix-balanced-brackets` | medium     | unclosed brackets are not reported                              | practice |
| `fix-top-players`       | hard       | overwrites instead of summing; ties in reverse order (two bugs) | both     |
| `fix-cheapest-route`    | hard       | two-way roads stored one way                                    | practice |

Reviewer: solve each one, check the statement covers every hidden test category, then approve.
