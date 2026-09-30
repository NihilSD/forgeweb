{{person}} walks from the north-west corner of a park grid to the south-east corner, only ever moving **right** or **down**. Some cells are flower beds (`#`) and can't be walked on; open cells are `.`.

Given the grid as a list of strings, return the number of different routes, **modulo 1,000,000,007**. If the start or end is a flower bed, there are 0 routes.

```
count_paths({{example}})  ->  {{example_result}}
```

Grids can be up to 60 × 60.
