## 1. Nudge

Try the second visible test. Which of the two user-supplied values reaches the HTML without going through `escape`?

## 2. Approach

The comment text is escaped, but the author name is inserted raw in **two** places: inside the `title` attribute and inside `<b>`. Both need escaping.

## 3. Pseudocode

```
safe_author = escape(author)
safe_text   = escape(text)
return '<p class="comment" title="Comment by ' + safe_author + '"><b>' + safe_author + '</b>: ' + safe_text + '</p>'
```

## 4. Solution

Wrap both uses of `author` in `escape(...)`. For example in Python: `f'<p class="comment" title="Comment by {escape(author)}"><b>{escape(author)}</b>: {escape(text)}</p>'`.
