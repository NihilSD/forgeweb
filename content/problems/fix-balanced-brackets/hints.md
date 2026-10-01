## 1. Nudge

What is on the stack after reading `((`? What does the function return then?

## 2. Approach

Every closing bracket is checked, but brackets that are still open when the snippet ends are never reported. At the end, the stack must be empty.

## 3. Pseudocode

```
for each character:
    opening bracket → push it
    closing bracket → stack must be non-empty and pop the matching opener
return stack is empty
```

## 4. Solution

Change the last line to `return not stack` (Python) or `return stack.length === 0;` (JavaScript).
