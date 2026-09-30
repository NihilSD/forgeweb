## Idea

This is a classic **sliding window**. All values are non-negative, so adding a day never decreases the total and removing one never increases it. That monotonic property lets two pointers find every maximal window in one pass.

## Why it works

For each right edge, the loop shrinks the window just enough to make it fit. Because values are non-negative, any window ending at `right` that starts before `left` would be over budget too, so `right - left + 1` is the best length for that right edge. Taking the maximum over all right edges gives the answer.

## Complexity

O(n) time: each index enters and leaves the window at most once. O(1) extra memory.

## Common mistakes

- Using `>=` instead of `>` when shrinking, which rejects windows that exactly match the budget.
- Checking every start and end (O(n²)), which is too slow for 100,000 days.
- Forgetting that an empty list or a budget smaller than every day should return 0.
