The **{{editor}}** code editor warns about unbalanced brackets. `is_balanced(code)` checks a
snippet.

- The brackets are `()`, `[]` and `{}`. Every other character is ignored.
- The snippet is balanced when every opening bracket is closed by the matching kind, in the right
  order, and nothing is left open at the end.

Return `True` if the snippet is balanced, `False` otherwise. An empty snippet is balanced.

Snippets with brackets that are never closed get no warning. The function has **one bug**.

## Example

```
code   = {{example_code}}
result = {{example_result}}
```
