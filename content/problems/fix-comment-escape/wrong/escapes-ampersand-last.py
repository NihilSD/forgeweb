# Escapes & after the others, so "<" becomes "&amp;lt;" (double escaping).
def escape(value):
    return (
        value.replace('<', '&lt;')
        .replace('>', '&gt;')
        .replace('"', '&quot;')
        .replace("'", '&#x27;')
        .replace('&', '&amp;')
    )


def render_comment(author, text):
    return (
        f'<p class="comment" title="Comment by {escape(author)}">'
        f'<b>{escape(author)}</b>: {escape(text)}</p>'
    )
