The **{{site}}** forum builds the HTML for each comment on the server:

```html
<p class="comment" title="Comment by AUTHOR"><b>AUTHOR</b>: TEXT</p>
```

`render_comment(author, text)` fills in the author's display name and the comment text. Both come straight from users. A security review found a **cross-site scripting (XSS)** bug: a user who picks a display name like `<img src=x onerror=alert(1)>` gets their script run in every reader's browser.

Fix the function so that **every user-supplied value** is escaped before it goes into the HTML. Escape exactly these five characters, in both places:

| Character | Replace with |
| --------- | ------------ |
| `&`       | `&amp;`      |
| `<`       | `&lt;`       |
| `>`       | `&gt;`       |
| `"`       | `&quot;`     |
| `'`       | `&#x27;`     |

Keep the function name and the HTML layout exactly the same.

## Example

```
author = {{example_author}}
text   = {{example_text}}
result = {{example_result}}
```
