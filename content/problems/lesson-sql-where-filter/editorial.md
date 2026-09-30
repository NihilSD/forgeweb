## Idea

WHERE keeps only rows for which the whole condition is true; AND requires both parts.

## Why it works

Each row is tested independently.

## Complexity

One scan.

## Common mistakes

"Less than 20" excludes exactly 20.00; `<=` includes it.
