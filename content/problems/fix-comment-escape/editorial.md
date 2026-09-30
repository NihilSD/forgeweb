## Idea

Every value that comes from a user must be **encoded for the context it is written into**. Here both contexts are HTML: element content and a double-quoted attribute. The original code escaped the comment but forgot the display name, a classic stored-XSS bug.

## Why it works

After escaping, `<`, `>`, `&` and the quotes can no longer start a tag, end the attribute or begin an entity, so the browser treats the user's input as text. `&` must be replaced **first**; otherwise the `&` in `&lt;` would itself be escaped.

## Complexity

Linear in the length of the input.

## Common mistakes

- Escaping `&` last (double escaping) or forgetting quotes (attribute injection).
- Trying to _remove_ dangerous tags with a blocklist instead of encoding everything.
- In real projects, prefer a template engine or framework that escapes by default (React, Jinja2 with autoescape), and add a Content Security Policy as a second layer of defence.
