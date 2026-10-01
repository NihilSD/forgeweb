# Forge content style guide

How Forge problems, hints, editorials and lessons read, so 150+ problems feel like one product.
`pnpm problems:validate` checks the structure. This guide covers what a validator can't check.

## Voice

- Plain, friendly British English, at about B2 level. Short sentences. Spell out jargon the first
  time (for example "a hash map (dictionary)").
- Address the solver as "you". No "simply", "just", "obviously" or "trivial".
- Realistic, small scenarios: a shop, a warehouse, a support tool, a game. People and companies
  are fictional. No real brands, no real people, nothing violent or political.
- Inclusive names drawn from many cultures (the generator's `rng.word('person')` list).
- Money in integer minor units or as decimals with a clear currency, times in UTC, ISO dates.

## Statement (`statement.md`)

1. **One-paragraph story** that says why the function exists.
2. **The contract**: function name in backticks, every parameter with its type and range, the
   return value, and every edge case that the hidden tests use (empty input, ties, duplicates,
   negatives, null). Hidden tests must never test anything the statement doesn't say.
3. For **fix-code**: say how many bugs there are ("one bug", "two bugs") and what the user sees
   going wrong, without naming the line.
4. **Example** block with `{{placeholders}}` from the generator, so every instance shows its own
   example. Python syntax for values in examples (`[1, 2]`, `None`, `True`).
5. Constraints last (sizes, value ranges), only when they matter for complexity.

Keep statements under about 250 words. Use bold sparingly, for the one rule people miss.

## Generators and tests

- Every seed must give a different, valid instance (the validator checks). Vary names, numbers
  and the example, not the rules.
- **Visible tests** (2–3): the example plus one small edge case. They show expected and actual
  values.
- **Hidden tests** (5–10): each has a short `category` that tells the user what kind of input
  failed ("empty list", "ties in score", "large input") without giving the data away.
- Include at least one **large** hidden test when complexity matters, sized so the reference runs
  in under 25% of the time limit.
- Known-wrong solutions in `wrong/` must fail **on every seed**: base the tests that catch them on
  fixed edge cases, not only on random data.

## Fix-code problems (Debugging track)

- The bug must be one a working developer really makes: off-by-one, wrong comparison, missing
  reset, mutated input, wrong default, missing case, ordering, integer vs float, shadowing.
- The starter must be **correct apart from the stated bugs**, idiomatic, and short (≤ 25 lines).
- Every language version has the same bugs in the same place.
- At least one visible test must fail on the starter, so "Run" shows the problem straight away.

## Hints (`hints.md`): exactly 4 levels

1. **Nudge**: a question that points at the right place, with no answer.
2. **Approach**: the idea in a few sentences.
3. **Pseudocode**: a short code block in neutral pseudocode.
4. **Solution**: the fix or the key lines, in Python (other languages where the syntax differs).

Each level should make sense without the next. Revealing hints costs XP, so every level must add
something.

## Editorial (`editorial.md`): four sections

`## Idea`, `## Why it works`, `## Complexity`, `## Common mistakes`. Explain the reasoning, not just
the code. Common mistakes should match the `wrong/` solutions and the hidden test categories.

## Follow-ups (`followups.ts`, competitive-enabled problems)

Offer at least one of each where it fits: predict (run-graded), edge case (Yes/No, run-graded),
change (`lines` pattern for where the rule lives, excluding the signature line), explain (static
choice computed from the user's code). Prompts must be answerable in 90 seconds from the user's own
code.

## Tags and difficulty

- Tags only from `CONCEPT_TAGS`: 1–3 per problem, most important first.
- Difficulty guide: **easy** is one idea and a single loop; **medium** needs a known pattern or two
  steps; **hard** combines patterns or needs careful edge cases; **expert** is contest-level.

## Review checklist (for the human approver)

- [ ] I solved it from the statement alone, in at least one language.
- [ ] The statement states every rule the hidden tests check.
- [ ] Hints climb in four useful steps; the editorial explains why.
- [ ] Nothing is offensive, real-brand or copied from elsewhere.
- [ ] Then set `review: approved` in `problem.yaml` and bump `version`.
