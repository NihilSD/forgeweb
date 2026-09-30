{{company}} numbers its builds with increasing integers and keeps them in a sorted list `builds` (duplicates are possible: rebuilt versions).

For each number in `queries`, find the position of the **first build whose number is at least** the query. If there is none, the answer is `len(builds)`.

Return the answers as a list, in the same order as `queries`.

```
first_at_least({{example}}, {{example_queries}})  ->  {{example_result}}
```

There can be 100,000 builds and 100,000 queries.
